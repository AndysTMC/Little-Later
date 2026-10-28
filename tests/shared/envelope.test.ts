import { describe, expect, it } from "vitest";
import {
	ENVELOPE_FORMAT,
	EnvelopeError,
	KDF_ITERATIONS,
	deriveContentKeys,
	importIndexKey,
	newKdfParams,
	normalizeUrl,
	openBytes,
	openValue,
	originKeyFor,
	randomKeyBytes,
	readEnvelopeHeader,
	sealBytes,
	sealValue,
	unwrapKey,
	urlKeyFor,
	wrapKey,
	type EnvelopeLocation,
} from "little-shared/utils/envelope";

const location: EnvelopeLocation = {
	table: "saves",
	id: "0b6c3f4e-1d2a-4c55-9a7e-1f2e3d4c5b6a",
	profileId: "profile-1",
	field: "body",
};

// Tests use a low iteration count; production defaults are checked separately.
const fastKdf = () => newKdfParams(1_000);

describe("envelope", () => {
	it("round-trips a value and writes the LLE header", async () => {
		const keys = await deriveContentKeys(randomKeyBytes(), 1);
		const value = { title: "Read later", tags: ["a", "b"], n: 3 };
		const envelope = await sealValue(keys, location, value);

		expect(Array.from(envelope.slice(0, 3))).toEqual([0x4c, 0x4c, 0x45]);
		expect(readEnvelopeHeader(envelope)).toEqual({
			format: ENVELOPE_FORMAT,
			keyId: 1,
		});
		expect(await openValue(keys, location, envelope)).toEqual(value);
	});

	it("uses a fresh IV for every seal", async () => {
		const keys = await deriveContentKeys(randomKeyBytes(), 1);
		const a = await sealValue(keys, location, "same");
		const b = await sealValue(keys, location, "same");
		expect(a).not.toEqual(b);
	});

	it.each([
		["table", { ...location, table: "notes" }],
		["id", { ...location, id: "another-id" }],
		["profileId", { ...location, profileId: "profile-2" }],
		["field", { ...location, field: "preview" }],
	])("rejects a ciphertext moved to another %s", async (_, moved) => {
		const keys = await deriveContentKeys(randomKeyBytes(), 1);
		const envelope = await sealValue(keys, location, "secret");
		await expect(openValue(keys, moved, envelope)).rejects.toThrow(
			EnvelopeError,
		);
	});

	it("does not confuse location parts that concatenate the same", async () => {
		const keys = await deriveContentKeys(randomKeyBytes(), 1);
		const envelope = await sealValue(
			keys,
			{ ...location, table: "ab", id: "c" },
			"x",
		);
		await expect(
			openValue(keys, { ...location, table: "a", id: "bc" }, envelope),
		).rejects.toThrow(EnvelopeError);
	});

	it("rejects a different root key", async () => {
		const keys = await deriveContentKeys(randomKeyBytes(), 1);
		const other = await deriveContentKeys(randomKeyBytes(), 1);
		const envelope = await sealValue(keys, location, "secret");
		await expect(openValue(other, location, envelope)).rejects.toThrow(
			EnvelopeError,
		);
	});

	it("rejects tampered header, IV and ciphertext bytes", async () => {
		const keys = await deriveContentKeys(randomKeyBytes(), 2);
		const envelope = await sealBytes(
			keys.content,
			2,
			location,
			new Uint8Array([1, 2, 3]),
		);
		// Byte 4 is the key id: rewriting it must fail authentication, not
		// just the key id check, so open the raw bytes.
		for (const index of [4, 5, envelope.length - 1]) {
			const tampered = envelope.slice();
			tampered[index] ^= 0x01;
			await expect(
				openBytes(keys.content, location, tampered),
			).rejects.toThrow(EnvelopeError);
		}
	});

	it("rejects wrong magic, unknown format and short input", async () => {
		const keys = await deriveContentKeys(randomKeyBytes(), 1);
		const envelope = await sealValue(keys, location, "x");

		const badMagic = envelope.slice();
		badMagic[0] = 0x00;
		expect(() => readEnvelopeHeader(badMagic)).toThrow(
			/Not a Little Later/,
		);

		const future = envelope.slice();
		future[3] = ENVELOPE_FORMAT + 1;
		expect(() => readEnvelopeHeader(future)).toThrow(
			/Unsupported envelope/,
		);

		expect(() => readEnvelopeHeader(envelope.slice(0, 20))).toThrow(
			/too short/,
		);
	});

	it("rejects key id 0 in a header", async () => {
		const keys = await deriveContentKeys(randomKeyBytes(), 1);
		const envelope = await sealValue(keys, location, "x");
		envelope[4] = 0;
		expect(() => readEnvelopeHeader(envelope)).toThrow(/Key id/);
	});

	it("refuses to open with keys of another key id", async () => {
		const root = randomKeyBytes();
		const envelope = await sealValue(
			await deriveContentKeys(root, 1),
			location,
			"x",
		);
		await expect(
			openValue(await deriveContentKeys(root, 2), location, envelope),
		).rejects.toThrow(/uses key 1/);
	});

	it("keeps content and asset subkeys separate", async () => {
		const keys = await deriveContentKeys(randomKeyBytes(), 1);
		const envelope = await sealBytes(
			keys.asset,
			1,
			location,
			new Uint8Array([9]),
		);
		expect(await openBytes(keys.asset, location, envelope)).toEqual(
			new Uint8Array([9]),
		);
		await expect(
			openBytes(keys.content, location, envelope),
		).rejects.toThrow(EnvelopeError);
	});

	it("derives non-extractable subkeys", async () => {
		const keys = await deriveContentKeys(randomKeyBytes(), 1);
		expect(keys.content.extractable).toBe(false);
		expect(keys.asset.extractable).toBe(false);
		await expect(
			crypto.subtle.exportKey("raw", keys.content),
		).rejects.toThrow();
	});

	it("rejects invalid key ids and key lengths", async () => {
		await expect(deriveContentKeys(randomKeyBytes(), 0)).rejects.toThrow(
			/Key id/,
		);
		await expect(deriveContentKeys(randomKeyBytes(), 256)).rejects.toThrow(
			/Key id/,
		);
		await expect(deriveContentKeys(new Uint8Array(16), 1)).rejects.toThrow(
			/32 bytes/,
		);
	});
});

describe("key wrapping", () => {
	it("defaults to PBKDF2-SHA-256 with 600,000 iterations and a 16-byte salt", () => {
		const kdf = newKdfParams();
		expect(kdf.name).toBe("PBKDF2-SHA-256");
		expect(kdf.iterations).toBe(KDF_ITERATIONS);
		expect(KDF_ITERATIONS).toBe(600_000);
		expect(kdf.salt.length).toBe(16);
	});

	it("unwraps with the right password and profile", async () => {
		const root = randomKeyBytes();
		const wrapped = await wrapKey(root, "pw", "profile-1", 1, fastKdf());
		expect(await unwrapKey(wrapped, "pw", "profile-1")).toEqual(root);
	});

	it("rejects a wrong password", async () => {
		const wrapped = await wrapKey(
			randomKeyBytes(),
			"pw",
			"profile-1",
			1,
			fastKdf(),
		);
		await expect(unwrapKey(wrapped, "nope", "profile-1")).rejects.toThrow(
			/Wrong password/,
		);
	});

	it("rejects a wrapped key moved to another profile", async () => {
		const wrapped = await wrapKey(
			randomKeyBytes(),
			"pw",
			"profile-1",
			1,
			fastKdf(),
		);
		await expect(unwrapKey(wrapped, "pw", "profile-2")).rejects.toThrow(
			EnvelopeError,
		);
	});

	it("rejects a changed key id", async () => {
		const wrapped = await wrapKey(
			randomKeyBytes(),
			"pw",
			"profile-1",
			1,
			fastKdf(),
		);
		await expect(
			unwrapKey({ ...wrapped, keyId: 2 }, "pw", "profile-1"),
		).rejects.toThrow(EnvelopeError);
	});

	it("rejects a lowered iteration count", async () => {
		const kdf = newKdfParams(2_000);
		const wrapped = await wrapKey(
			randomKeyBytes(),
			"pw",
			"profile-1",
			1,
			kdf,
		);
		await expect(
			unwrapKey(
				{ ...wrapped, kdf: { ...kdf, iterations: 1_000 } },
				"pw",
				"profile-1",
			),
		).rejects.toThrow(EnvelopeError);
	});

	it.each([
		["zero iterations", { iterations: 0 }],
		["fractional iterations", { iterations: 1.5 }],
		["oversized iterations", { iterations: 2_147_483_647 }],
		["a short salt", { salt: new Uint8Array(0) }],
	])(
		"rejects %s before deriving a key",
		async (_, change) => {
			const wrapped = await wrapKey(
				randomKeyBytes(),
				"pw",
				"profile-1",
				1,
				fastKdf(),
			);
			const tampered = { ...wrapped, kdf: { ...wrapped.kdf, ...change } };
			await expect(
				unwrapKey(tampered, "pw", "profile-1"),
			).rejects.toThrow(/Unsupported key derivation parameters/);
			await expect(
				wrapKey(randomKeyBytes(), "pw", "profile-1", 1, tampered.kdf),
			).rejects.toThrow(/Unsupported key derivation parameters/);
		},
		1_000,
	);

	it("rejects a wrapped key with a non-standard IV length", async () => {
		const wrapped = await wrapKey(
			randomKeyBytes(),
			"pw",
			"profile-1",
			1,
			fastKdf(),
		);
		await expect(
			unwrapKey(
				{ ...wrapped, iv: new Uint8Array(16) },
				"pw",
				"profile-1",
			),
		).rejects.toThrow(/IV/);
	});

	it("rejects an unknown key derivation", async () => {
		const wrapped = await wrapKey(
			randomKeyBytes(),
			"pw",
			"profile-1",
			1,
			fastKdf(),
		);
		await expect(
			unwrapKey(
				{
					...wrapped,
					kdf: { ...wrapped.kdf, name: "MD5" as "PBKDF2-SHA-256" },
				},
				"pw",
				"profile-1",
			),
		).rejects.toThrow(/Unsupported key derivation/);
	});
});

describe("index keys", () => {
	it("normalizes scheme, host, default port and fragment only", () => {
		expect(normalizeUrl("HTTPS://Example.COM:443/Path?q=A#top")).toBe(
			"https://example.com/Path?q=A",
		);
	});

	it("gives equal urlKeys for equivalent URLs and differing ones otherwise", async () => {
		const key = await importIndexKey(randomKeyBytes());
		const a = await urlKeyFor(key, "https://example.com/a#x");
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(await urlKeyFor(key, "HTTPS://EXAMPLE.com/a")).toBe(a);
		expect(await urlKeyFor(key, "https://example.com/A")).not.toBe(a);
	});

	it("depends on the profile's index key", async () => {
		const url = "https://example.com/a";
		const a = await urlKeyFor(await importIndexKey(randomKeyBytes()), url);
		const b = await urlKeyFor(await importIndexKey(randomKeyBytes()), url);
		expect(a).not.toBe(b);
	});

	it("rejects invalid URLs as a rejected promise", async () => {
		const key = await importIndexKey(randomKeyBytes());
		const url = urlKeyFor(key, "not a url");
		const origin = originKeyFor(key, "not a url");
		await expect(url).rejects.toThrow(TypeError);
		await expect(origin).rejects.toThrow(TypeError);
	});

	it("refuses origin keys for URLs without a real origin", async () => {
		const key = await importIndexKey(randomKeyBytes());
		await expect(originKeyFor(key, "file:///tmp/a.html")).rejects.toThrow(
			/no origin/,
		);
		await expect(originKeyFor(key, "data:text/plain,hi")).rejects.toThrow(
			/no origin/,
		);
	});

	it("keys origins apart from URLs", async () => {
		const key = await importIndexKey(randomKeyBytes());
		const origin = await originKeyFor(key, "https://example.com/a/b");
		expect(await originKeyFor(key, "https://example.com/other")).toBe(
			origin,
		);
		expect(await urlKeyFor(key, "https://example.com")).not.toBe(origin);
	});
});
