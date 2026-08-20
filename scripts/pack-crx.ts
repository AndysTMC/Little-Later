/**
 * Pack a Chrome CRX3 from a zip, using SIGNING_KEY (PEM or base64 PEM).
 * Never prints key material.
 */
import {
	constants as cryptoConstants,
	createHash,
	createPrivateKey,
	createPublicKey,
	sign,
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CRX_MAGIC = Buffer.from("Cr24", "ascii");
const SIGNED_DATA_MAGIC = Buffer.from("CRX3 SignedData\x00", "utf8");

export const loadSigningKeyPem = (raw: string | undefined): string => {
	if (raw === undefined || raw.trim() === "") {
		throw new Error(
			"SIGNING_KEY is missing. Set an RSA PEM private key (raw or base64).",
		);
	}
	let text = raw.trim().replace(/^\uFEFF/, "");
	if (
		(text.startsWith('"') && text.endsWith('"')) ||
		(text.startsWith("'") && text.endsWith("'"))
	) {
		text = text.slice(1, -1);
	}
	text = text.replace(/\r\n/g, "\n");
	if (!text.includes("-----BEGIN") && text.includes("\\n")) {
		text = text.replace(/\\n/g, "\n");
	}
	if (!text.includes("-----BEGIN")) {
		let decoded = Buffer.from(text, "base64").toString("utf8").trim();
		decoded = decoded.replace(/\r\n/g, "\n");
		if (!decoded.includes("-----BEGIN") && decoded.includes("\\n")) {
			decoded = decoded.replace(/\\n/g, "\n");
		}
		text = decoded;
	}
	if (!/-----BEGIN ([A-Z0-9 ]+)?PRIVATE KEY-----/.test(text)) {
		throw new Error(
			"SIGNING_KEY is not a PEM private key (expected PKCS#1/PKCS#8 PEM, or base64 of that PEM).",
		);
	}
	return text;
};

const rsaPrivateKey = (pem: string) => {
	let key;
	try {
		key = createPrivateKey(pem);
	} catch {
		throw new Error(
			"SIGNING_KEY could not be parsed as an RSA private key.",
		);
	}
	if (key.asymmetricKeyType !== "rsa") {
		throw new Error("SIGNING_KEY must be an RSA private key.");
	}
	const modulusLength = key.asymmetricKeyDetails?.modulusLength;
	if (modulusLength !== undefined && modulusLength < 2048) {
		throw new Error("SIGNING_KEY RSA modulus must be at least 2048 bits.");
	}
	return key;
};

export const publicKeySpkiDer = (pem: string): Buffer => {
	const key = rsaPrivateKey(pem);
	return createPublicKey(key).export({ type: "spki", format: "der" });
};

export const extensionIdFromSpki = (spkiDer: Buffer): string => {
	const digest = createHash("sha256").update(spkiDer).digest();
	const idBytes = digest.subarray(0, 16);
	let id = "";
	for (const byte of idBytes) {
		id += String.fromCharCode(0x61 + ((byte >> 4) & 0xf));
		id += String.fromCharCode(0x61 + (byte & 0xf));
	}
	return id;
};

const encodeVarint = (value: number): Buffer => {
	const bytes: Array<number> = [];
	let n = value >>> 0;
	while (n > 0x7f) {
		bytes.push((n & 0x7f) | 0x80);
		n >>>= 7;
	}
	bytes.push(n);
	return Buffer.from(bytes);
};

const encodeLenDelim = (field: number, data: Buffer): Buffer => {
	const tag = encodeVarint((field << 3) | 2);
	return Buffer.concat([tag, encodeVarint(data.length), data]);
};

export const packCrx3 = (
	zipBytes: Buffer,
	privateKeyPem: string,
): { crx: Buffer; extensionId: string; publicKeyBase64: string } => {
	const key = rsaPrivateKey(privateKeyPem);
	const spki = createPublicKey(key).export({
		type: "spki",
		format: "der",
	});
	const crxId = createHash("sha256").update(spki).digest().subarray(0, 16);
	const signedHeaderData = encodeLenDelim(1, Buffer.from(crxId));

	const toSign = Buffer.concat([
		SIGNED_DATA_MAGIC,
		(() => {
			const len = Buffer.alloc(4);
			len.writeUInt32LE(signedHeaderData.length);
			return len;
		})(),
		signedHeaderData,
		zipBytes,
	]);

	const signature = sign("sha256", toSign, {
		key,
		padding: cryptoConstants.RSA_PKCS1_PADDING,
	});

	const proof = Buffer.concat([
		encodeLenDelim(1, Buffer.from(spki)),
		encodeLenDelim(2, signature),
	]);
	const header = Buffer.concat([
		encodeLenDelim(2, proof),
		encodeLenDelim(10000, signedHeaderData),
	]);

	const version = Buffer.alloc(4);
	version.writeUInt32LE(3);
	const headerSize = Buffer.alloc(4);
	headerSize.writeUInt32LE(header.length);

	const crx = Buffer.concat([
		CRX_MAGIC,
		version,
		headerSize,
		header,
		zipBytes,
	]);

	return {
		crx,
		extensionId: extensionIdFromSpki(Buffer.from(spki)),
		publicKeyBase64: Buffer.from(spki).toString("base64"),
	};
};

export const injectManifestPublicKey = (
	manifestJson: string,
	publicKeyBase64: string,
): string => {
	const parsed: unknown = JSON.parse(manifestJson);
	if (
		parsed === null ||
		typeof parsed !== "object" ||
		Array.isArray(parsed)
	) {
		throw new Error("dist manifest.json must be a JSON object.");
	}
	const manifest = parsed as Record<string, unknown>;
	manifest.key = publicKeyBase64;
	return `${JSON.stringify(manifest, null, "\t")}\n`;
};

const usage = (): never => {
	console.error(
		"Usage:\n" +
			"  bun scripts/pack-crx.ts inject-manifest-key <manifest.json>\n" +
			"  bun scripts/pack-crx.ts pack <extension.zip> <out.crx>\n" +
			"SIGNING_KEY must be set (RSA PEM, or base64 of that PEM).",
	);
	process.exit(1);
};

const runCli = (argv: Array<string>): void => {
	const pem = loadSigningKeyPem(process.env.SIGNING_KEY);
	const command = argv[0];
	if (command === "inject-manifest-key") {
		const manifestPath = argv[1];
		if (!manifestPath) usage();
		const abs = resolve(manifestPath);
		const next = injectManifestPublicKey(
			readFileSync(abs, "utf8"),
			publicKeySpkiDer(pem).toString("base64"),
		);
		writeFileSync(abs, next);
		const id = extensionIdFromSpki(publicKeySpkiDer(pem));
		console.log(`Injected manifest key. Extension ID: ${id}`);
		return;
	}
	if (command === "pack") {
		const zipPath = argv[1];
		const outPath = argv[2];
		if (!zipPath || !outPath) usage();
		const zipBytes = readFileSync(resolve(zipPath));
		if (zipBytes.length < 4 || zipBytes.readUInt32LE(0) !== 0x04034b50) {
			throw new Error("Input is not a zip file.");
		}
		const packed = packCrx3(zipBytes, pem);
		writeFileSync(resolve(outPath), packed.crx);
		console.log(`Wrote CRX. Extension ID: ${packed.extensionId}`);
		return;
	}
	usage();
};

const isDirectRun = (): boolean => {
	const entry = process.argv[1];
	if (!entry) {
		return false;
	}
	try {
		return fileURLToPath(import.meta.url) === resolve(entry);
	} catch {
		return false;
	}
};

if (isDirectRun()) {
	try {
		runCli(process.argv.slice(2));
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to pack CRX.";
		console.error(message);
		process.exit(1);
	}
}
