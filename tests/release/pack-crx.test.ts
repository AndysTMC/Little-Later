/**
 * @vitest-environment node
 */
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	extensionIdFromSpki,
	injectManifestPublicKey,
	loadSigningKeyPem,
	packCrx3,
	publicKeySpkiDer,
} from "../../scripts/pack-crx";

const rsaPem = (): string =>
	generateKeyPairSync("rsa", {
		modulusLength: 2048,
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
		publicKeyEncoding: { type: "spki", format: "pem" },
	}).privateKey;

const storedZip = (files: Record<string, string>): Buffer => {
	const crcTable = (() => {
		const table = new Uint32Array(256);
		for (let i = 0; i < 256; i++) {
			let c = i;
			for (let k = 0; k < 8; k++) {
				c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			}
			table[i] = c >>> 0;
		}
		return table;
	})();
	const crc32 = (data: Buffer): number => {
		let crc = 0xffffffff;
		for (const byte of data) {
			crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
		}
		return (crc ^ 0xffffffff) >>> 0;
	};

	const locals: Array<Buffer> = [];
	const centrals: Array<Buffer> = [];
	let offset = 0;
	for (const [name, text] of Object.entries(files)) {
		const data = Buffer.from(text, "utf8");
		const nameBytes = Buffer.from(name, "utf8");
		const crc = crc32(data);
		const local = Buffer.alloc(30 + nameBytes.length + data.length);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBytes.length, 26);
		nameBytes.copy(local, 30);
		data.copy(local, 30 + nameBytes.length);
		const central = Buffer.alloc(46 + nameBytes.length);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(nameBytes.length, 28);
		central.writeUInt32LE(offset, 42);
		nameBytes.copy(central, 46);
		locals.push(local);
		centrals.push(central);
		offset += local.length;
	}
	const centralDir = Buffer.concat(centrals);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(centrals.length, 8);
	eocd.writeUInt16LE(centrals.length, 10);
	eocd.writeUInt32LE(centralDir.length, 12);
	eocd.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, centralDir, eocd]);
};

describe("pack-crx", () => {
	it("packs a CRX3 whose payload is the zip and whose id is stable", () => {
		const pem = rsaPem();
		const zip = storedZip({
			"manifest.json": JSON.stringify({
				manifest_version: 3,
				name: "fixture",
				version: "0.0.0",
			}),
		});
		const packed = packCrx3(zip, pem);
		expect(packed.crx.subarray(0, 4).toString("ascii")).toBe("Cr24");
		expect(packed.crx.readUInt32LE(4)).toBe(3);
		const headerSize = packed.crx.readUInt32LE(8);
		const payload = packed.crx.subarray(12 + headerSize);
		expect(Buffer.compare(payload, zip)).toBe(0);
		expect(packed.extensionId).toMatch(/^[a-p]{32}$/);
		expect(packed.extensionId).toBe(
			extensionIdFromSpki(publicKeySpkiDer(pem)),
		);
	});

	it("injects the public key into the dist manifest", () => {
		const pem = rsaPem();
		const next = injectManifestPublicKey(
			JSON.stringify({ manifest_version: 3, name: "Little Later" }),
			publicKeySpkiDer(pem).toString("base64"),
		);
		const parsed = JSON.parse(next) as { key: string };
		expect(parsed.key).toBe(publicKeySpkiDer(pem).toString("base64"));
	});

	it("accepts base64 PEM and rejects empty keys without echoing them", () => {
		const pem = rsaPem();
		const loaded = loadSigningKeyPem(Buffer.from(pem).toString("base64"));
		expect(loaded.includes("PRIVATE KEY")).toBe(true);
		expect(() => loadSigningKeyPem("")).toThrow(/SIGNING_KEY is missing/);
		try {
			loadSigningKeyPem("not-a-key-super-secret");
			throw new Error("should have thrown");
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			expect(message).not.toContain("not-a-key-super-secret");
			expect(message).toMatch(/PEM private key/);
		}
	});
});
