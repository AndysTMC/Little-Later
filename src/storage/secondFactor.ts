import {
	newKdfParams,
	randomKeyBytes,
	unwrapKey,
	wrapKey,
	type KdfParams,
	type WrappedKey,
} from "little-shared/utils/envelope";

// Two-factor unlock (decision 0015). A random key W is wrapped by the
// password. Each root key is sealed under HKDF(W ‖ secret) once per
// factor: an authenticator's WebAuthn PRF output, or the recovery code.
// The password alone opens only W, which opens nothing; a factor's secret
// alone has no W. Changing the password re-wraps W, so every factor keeps
// working.

// A root key sealed for one factor.
export type FactorSeal = {
	keyId: number;
	iv: Uint8Array;
	ciphertext: Uint8Array;
};

export type AuthenticatorEntry = {
	// Plain: the unlock screen asks for this credential.
	credentialId: Uint8Array;
	// What the user called it, shown in Settings.
	name: string;
	addedAt: number;
	// What the authenticator's PRF is evaluated on; its output is the secret.
	prfSalt: Uint8Array;
	keys: Array<FactorSeal>;
};

export type SecondFactor = {
	// W, under the password.
	passwordKey: WrappedKey;
	authenticators: Array<AuthenticatorEntry>;
	recovery: { salt: Uint8Array; keys: Array<FactorSeal> };
};

// What unlocks a profile together with its password.
export type Factor =
	| { kind: "authenticator"; credentialId: Uint8Array; secret: Uint8Array }
	| { kind: "recovery"; code: string };

export class SecondFactorError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SecondFactorError";
	}
}

const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const encoder = new TextEncoder();

// W's wrap uses the profile's own wrap format under a separate owner, so
// it can never be mistaken for, or swapped with, a root key's wrap.
const passwordKeyOwner = (profileId: string) => `${profileId}/second-factor`;
const PASSWORD_KEY_ID = 1;

export const sealSecondKey = (
	secondKey: Uint8Array,
	password: string,
	profileId: string,
	kdf: KdfParams = newKdfParams(),
): Promise<WrappedKey> =>
	wrapKey(
		secondKey,
		password,
		passwordKeyOwner(profileId),
		PASSWORD_KEY_ID,
		kdf,
	);

// A wrong password fails here, before any factor is tried.
export const openSecondKey = (
	factor: SecondFactor,
	password: string,
	profileId: string,
): Promise<Uint8Array> =>
	unwrapKey(factor.passwordKey, password, passwordKeyOwner(profileId));

export const newSecondKey = (): Uint8Array => randomKeyBytes();
export const newSalt = (): Uint8Array =>
	crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

const toBuffer = (bytes: Uint8Array): ArrayBuffer =>
	bytes.slice().buffer as ArrayBuffer;

const concat = (a: Uint8Array, b: Uint8Array) => {
	const out = new Uint8Array(a.length + b.length);
	out.set(a);
	out.set(b, a.length);
	return out;
};

const factorKey = async (
	secondKey: Uint8Array,
	secret: Uint8Array,
	salt: Uint8Array,
	label: string,
): Promise<CryptoKey> => {
	const material = await crypto.subtle.importKey(
		"raw",
		toBuffer(concat(secondKey, secret)),
		"HKDF",
		false,
		["deriveKey"],
	);
	return crypto.subtle.deriveKey(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: toBuffer(salt),
			info: toBuffer(encoder.encode(`little/v1/factor/${label}`)),
		},
		material,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
};

// Binds a seal to its profile, root key id and factor, so one cannot be
// moved to another.
const sealAad = (profileId: string, keyId: number, label: string) =>
	encoder.encode(
		JSON.stringify(["little/v1/factor", profileId, keyId, label]),
	);

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const authenticatorLabel = (credentialId: Uint8Array) =>
	`authenticator:${toBase64(credentialId)}`;
const RECOVERY_LABEL = "recovery";

const sealRoots = async (
	roots: ReadonlyMap<number, Uint8Array>,
	key: CryptoKey,
	profileId: string,
	label: string,
): Promise<Array<FactorSeal>> => {
	const seals: Array<FactorSeal> = [];
	for (const [keyId, root] of roots) {
		const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
		const ciphertext = await crypto.subtle.encrypt(
			{
				name: "AES-GCM",
				iv: toBuffer(iv),
				additionalData: toBuffer(sealAad(profileId, keyId, label)),
			},
			key,
			toBuffer(root),
		);
		seals.push({ keyId, iv, ciphertext: new Uint8Array(ciphertext) });
	}
	return seals;
};

const openRoots = async (
	seals: ReadonlyArray<FactorSeal>,
	key: CryptoKey,
	profileId: string,
	label: string,
	refusal: string,
): Promise<Map<number, Uint8Array>> => {
	const roots = new Map<number, Uint8Array>();
	for (const seal of seals) {
		try {
			roots.set(
				seal.keyId,
				new Uint8Array(
					await crypto.subtle.decrypt(
						{
							name: "AES-GCM",
							iv: toBuffer(seal.iv),
							additionalData: toBuffer(
								sealAad(profileId, seal.keyId, label),
							),
						},
						key,
						toBuffer(seal.ciphertext),
					),
				),
			);
		} catch {
			throw new SecondFactorError(refusal);
		}
	}
	return roots;
};

// Recovery codes: 25 characters from an alphabet without look-alikes
// (about 120 bits), shown in groups of five.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_LENGTH = 25;

export const newRecoveryCode = (): string => {
	const chars: Array<string> = [];
	while (chars.length < RECOVERY_LENGTH) {
		for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
			// Rejection sampling keeps every character equally likely.
			if (byte < 248 && chars.length < RECOVERY_LENGTH) {
				chars.push(RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]);
			}
		}
	}
	return chars.join("").replace(/(.{5})(?!$)/g, "$1-");
};

// Typed as shown, in either case, with or without the dashes and spaces.
export const normalizeRecoveryCode = (code: string): string =>
	code.toUpperCase().replace(/[\s-]/g, "");

export const authenticatorSeals = async (
	roots: ReadonlyMap<number, Uint8Array>,
	secondKey: Uint8Array,
	credentialId: Uint8Array,
	prfSalt: Uint8Array,
	secret: Uint8Array,
	profileId: string,
): Promise<Array<FactorSeal>> => {
	const label = authenticatorLabel(credentialId);
	return sealRoots(
		roots,
		await factorKey(secondKey, secret, prfSalt, label),
		profileId,
		label,
	);
};

export const recoverySeals = async (
	roots: ReadonlyMap<number, Uint8Array>,
	secondKey: Uint8Array,
	code: string,
	salt: Uint8Array,
	profileId: string,
): Promise<Array<FactorSeal>> =>
	sealRoots(
		roots,
		await factorKey(
			secondKey,
			encoder.encode(normalizeRecoveryCode(code)),
			salt,
			RECOVERY_LABEL,
		),
		profileId,
		RECOVERY_LABEL,
	);

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
	a.length === b.length && a.every((byte, index) => byte === b[index]);

// The root keys, from W and the factor that came with the password.
export const openWithFactor = async (
	secondFactor: SecondFactor,
	secondKey: Uint8Array,
	factor: Factor,
	profileId: string,
): Promise<Map<number, Uint8Array>> => {
	if (factor.kind === "recovery") {
		return openRoots(
			secondFactor.recovery.keys,
			await factorKey(
				secondKey,
				encoder.encode(normalizeRecoveryCode(factor.code)),
				secondFactor.recovery.salt,
				RECOVERY_LABEL,
			),
			profileId,
			RECOVERY_LABEL,
			"That recovery code doesn't open this profile.",
		);
	}
	const entry = secondFactor.authenticators.find((candidate) =>
		sameBytes(candidate.credentialId, factor.credentialId),
	);
	if (!entry) {
		throw new SecondFactorError(
			"That security key or passkey isn't set up for this profile.",
		);
	}
	const label = authenticatorLabel(entry.credentialId);
	return openRoots(
		entry.keys,
		await factorKey(secondKey, factor.secret, entry.prfSalt, label),
		profileId,
		label,
		"That security key or passkey doesn't open this profile.",
	);
};
