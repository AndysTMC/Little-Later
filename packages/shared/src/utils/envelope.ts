import { encode, decode } from "@msgpack/msgpack";

// Storage format v1 crypto (decision 0010): a per-profile random root key
// encrypts record content through HKDF subkeys; a password-derived key only
// wraps the root key. Every ciphertext is an envelope whose header and
// location (table, id, profile, field) are authenticated.

export const ENVELOPE_MAGIC = new Uint8Array([0x4c, 0x4c, 0x45]); // "LLE"
export const ENVELOPE_FORMAT = 1;
const IV_LENGTH = 12;
const HEADER_LENGTH = ENVELOPE_MAGIC.length + 2;
const KEY_LENGTH = 32;

export const KDF_PBKDF2_SHA256 = "PBKDF2-SHA-256";
export const KDF_ITERATIONS = 600_000;
// Stored KDF parameters are read before anything authenticates them, so they
// are bounded to keep a tampered profile or backup from stalling the worker.
export const KDF_MAX_ITERATIONS = 10_000_000;
const SALT_LENGTH = 16;

export type EnvelopeLocation = {
	table: string;
	id: string;
	profileId: string;
	field: string;
};

export type ContentKeys = {
	keyId: number;
	content: CryptoKey;
	asset: CryptoKey;
};

export type KdfParams = {
	name: typeof KDF_PBKDF2_SHA256;
	iterations: number;
	salt: Uint8Array;
};

export type WrappedKey = {
	keyId: number;
	kdf: KdfParams;
	iv: Uint8Array;
	ciphertext: Uint8Array;
};

export class EnvelopeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EnvelopeError";
	}
}

const textEncoder = new TextEncoder();

const toBuffer = (view: Uint8Array): ArrayBuffer => {
	const buffer = new ArrayBuffer(view.byteLength);
	new Uint8Array(buffer).set(view);
	return buffer;
};

const concat = (...parts: Array<Uint8Array>): Uint8Array => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
};

// Length-prefixed parts, so ("ab","c") and ("a","bc") never encode the same.
const encodeParts = (parts: Array<string | number>): Uint8Array => {
	const chunks: Array<Uint8Array> = [];
	for (const part of parts) {
		const bytes = textEncoder.encode(String(part));
		const length = new Uint8Array(4);
		new DataView(length.buffer).setUint32(0, bytes.length);
		chunks.push(length, bytes);
	}
	return concat(...chunks);
};

const assertKeyId = (keyId: number) => {
	if (!Number.isInteger(keyId) || keyId < 1 || keyId > 255) {
		throw new EnvelopeError("Key id must be an integer from 1 to 255.");
	}
};

export const randomKeyBytes = (): Uint8Array =>
	crypto.getRandomValues(new Uint8Array(KEY_LENGTH));

const hkdfKey = async (
	root: Uint8Array,
	info: string,
	algorithm: AesKeyGenParams | HmacImportParams,
	usages: Array<KeyUsage>,
): Promise<CryptoKey> => {
	const base = await crypto.subtle.importKey(
		"raw",
		toBuffer(root),
		"HKDF",
		false,
		["deriveKey"],
	);
	return crypto.subtle.deriveKey(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: new Uint8Array(0),
			info: textEncoder.encode(info),
		},
		base,
		algorithm,
		false,
		usages,
	);
};

const assertKeyBytes = (bytes: Uint8Array) => {
	if (bytes.length !== KEY_LENGTH) {
		throw new EnvelopeError("Keys must be 32 bytes.");
	}
};

// Subkeys are non-extractable: a context imports them once from the root key
// bytes and keeps no raw copy (decision 0010, Keys).
export const deriveContentKeys = async (
	root: Uint8Array,
	keyId: number,
): Promise<ContentKeys> => {
	assertKeyBytes(root);
	assertKeyId(keyId);
	const aes = { name: "AES-GCM", length: 256 } as const;
	const [content, asset] = await Promise.all([
		hkdfKey(root, "little/v1/content", aes, ["encrypt", "decrypt"]),
		hkdfKey(root, "little/v1/asset", aes, ["encrypt", "decrypt"]),
	]);
	return { keyId, content, asset };
};

export const importIndexKey = async (
	indexKey: Uint8Array,
): Promise<CryptoKey> => {
	assertKeyBytes(indexKey);
	return hkdfKey(
		indexKey,
		"little/v1/index",
		{ name: "HMAC", hash: "SHA-256", length: 256 },
		["sign"],
	);
};

const headerFor = (keyId: number): Uint8Array =>
	concat(ENVELOPE_MAGIC, new Uint8Array([ENVELOPE_FORMAT, keyId]));

const aadFor = (header: Uint8Array, location: EnvelopeLocation) =>
	concat(
		header,
		encodeParts([
			location.table,
			location.id,
			location.profileId,
			location.field,
		]),
	);

export type EnvelopeHeader = { format: number; keyId: number };

export const readEnvelopeHeader = (envelope: Uint8Array): EnvelopeHeader => {
	if (envelope.length < HEADER_LENGTH + IV_LENGTH + 16) {
		throw new EnvelopeError("Envelope is too short.");
	}
	for (let i = 0; i < ENVELOPE_MAGIC.length; i++) {
		if (envelope[i] !== ENVELOPE_MAGIC[i]) {
			throw new EnvelopeError("Not a Little Later envelope.");
		}
	}
	const format = envelope[ENVELOPE_MAGIC.length];
	if (format !== ENVELOPE_FORMAT) {
		throw new EnvelopeError(`Unsupported envelope format ${format}.`);
	}
	const keyId = envelope[ENVELOPE_MAGIC.length + 1];
	assertKeyId(keyId);
	return { format, keyId };
};

export const sealBytes = async (
	key: CryptoKey,
	keyId: number,
	location: EnvelopeLocation,
	plaintext: Uint8Array,
): Promise<Uint8Array> => {
	assertKeyId(keyId);
	const header = headerFor(keyId);
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const ciphertext = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv,
			additionalData: toBuffer(aadFor(header, location)),
		},
		key,
		toBuffer(plaintext),
	);
	return concat(header, iv, new Uint8Array(ciphertext));
};

export const openBytes = async (
	key: CryptoKey,
	location: EnvelopeLocation,
	envelope: Uint8Array,
): Promise<Uint8Array> => {
	readEnvelopeHeader(envelope);
	const header = envelope.slice(0, HEADER_LENGTH);
	const iv = envelope.slice(HEADER_LENGTH, HEADER_LENGTH + IV_LENGTH);
	const ciphertext = envelope.slice(HEADER_LENGTH + IV_LENGTH);
	try {
		const plaintext = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv,
				additionalData: toBuffer(aadFor(header, location)),
			},
			key,
			ciphertext,
		);
		return new Uint8Array(plaintext);
	} catch {
		throw new EnvelopeError(
			"Envelope did not authenticate: wrong key, location or corrupted data.",
		);
	}
};

export const sealValue = async <T>(
	keys: ContentKeys,
	location: EnvelopeLocation,
	value: T,
): Promise<Uint8Array> =>
	sealBytes(keys.content, keys.keyId, location, encode(value));

export const openValue = async <T>(
	keys: ContentKeys,
	location: EnvelopeLocation,
	envelope: Uint8Array,
): Promise<T> => {
	const { keyId } = readEnvelopeHeader(envelope);
	if (keyId !== keys.keyId) {
		throw new EnvelopeError(
			`Envelope uses key ${keyId}, but key ${keys.keyId} was given.`,
		);
	}
	return decode(await openBytes(keys.content, location, envelope)) as T;
};

const deriveWrappingKey = async (
	password: string,
	kdf: KdfParams,
): Promise<CryptoKey> => {
	if (kdf.name !== KDF_PBKDF2_SHA256) {
		throw new EnvelopeError(`Unsupported key derivation ${kdf.name}.`);
	}
	if (
		!Number.isInteger(kdf.iterations) ||
		kdf.iterations < 1 ||
		kdf.iterations > KDF_MAX_ITERATIONS ||
		kdf.salt.length !== SALT_LENGTH
	) {
		throw new EnvelopeError("Unsupported key derivation parameters.");
	}
	const material = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode(password),
		"PBKDF2",
		false,
		["deriveKey"],
	);
	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			hash: "SHA-256",
			salt: toBuffer(kdf.salt),
			iterations: kdf.iterations,
		},
		material,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
};

// The wrap binds the profile, key id and KDF parameters, so a stored
// parameter cannot be swapped without the unwrap failing.
const wrapAad = (profileId: string, keyId: number, kdf: KdfParams) =>
	concat(
		encodeParts([
			"little/v1/wrap",
			profileId,
			keyId,
			kdf.name,
			kdf.iterations,
		]),
		kdf.salt,
	);

export const newKdfParams = (
	iterations: number = KDF_ITERATIONS,
): KdfParams => ({
	name: KDF_PBKDF2_SHA256,
	iterations,
	salt: crypto.getRandomValues(new Uint8Array(SALT_LENGTH)),
});

export const wrapKey = async (
	key: Uint8Array,
	password: string,
	profileId: string,
	keyId: number,
	kdf: KdfParams = newKdfParams(),
): Promise<WrappedKey> => {
	assertKeyBytes(key);
	assertKeyId(keyId);
	const wrappingKey = await deriveWrappingKey(password, kdf);
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const ciphertext = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv,
			additionalData: toBuffer(wrapAad(profileId, keyId, kdf)),
		},
		wrappingKey,
		toBuffer(key),
	);
	return { keyId, kdf, iv, ciphertext: new Uint8Array(ciphertext) };
};

// A wrong password fails the GCM tag (decision 0010: offline guessing only,
// priced by the KDF).
export const unwrapKey = async (
	wrapped: WrappedKey,
	password: string,
	profileId: string,
): Promise<Uint8Array> => {
	assertKeyId(wrapped.keyId);
	if (wrapped.iv.length !== IV_LENGTH) {
		throw new EnvelopeError("Wrapped key IV must be 12 bytes.");
	}
	const wrappingKey = await deriveWrappingKey(password, wrapped.kdf);
	try {
		const key = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: toBuffer(wrapped.iv),
				additionalData: toBuffer(
					wrapAad(profileId, wrapped.keyId, wrapped.kdf),
				),
			},
			wrappingKey,
			toBuffer(wrapped.ciphertext),
		);
		return new Uint8Array(key);
	} catch {
		throw new EnvelopeError("Wrong password or damaged key.");
	}
};

// Canonical form for URL equality: lowercase scheme and host (URL does
// this), no fragment, default ports dropped (URL does this). Paths and
// queries stay as given, since servers may treat them case-sensitively.
export const normalizeUrl = (url: string): string => {
	const parsed = new URL(url);
	parsed.hash = "";
	return parsed.href;
};

const hmacHex = async (key: CryptoKey, parts: Array<string>) => {
	const mac = await crypto.subtle.sign(
		"HMAC",
		key,
		toBuffer(encodeParts(parts)),
	);
	return Array.from(new Uint8Array(mac), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
};

export const urlKeyFor = async (indexKey: CryptoKey, url: string) =>
	hmacHex(indexKey, ["url", normalizeUrl(url)]);

// Opaque origins (file:, data:, about:) all serialize as "null", so keying
// them would group unrelated pages together.
export const originKeyFor = async (indexKey: CryptoKey, url: string) => {
	const { origin, protocol } = new URL(url);
	if (origin === "null") {
		throw new EnvelopeError(`A ${protocol} URL has no origin.`);
	}
	return hmacHex(indexKey, ["origin", origin]);
};
