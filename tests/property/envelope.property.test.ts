import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	EnvelopeError,
	deriveContentKeys,
	normalizeUrl,
	openValue,
	randomKeyBytes,
	readEnvelopeHeader,
	sealValue,
	type EnvelopeLocation,
} from "little-shared/utils/envelope";

// Property tests: fast-check generates inputs, including malformed ones, and
// shrinks any failure to a minimal case.

const keysPromise = deriveContentKeys(randomKeyBytes(), 1);

const locationArb: fc.Arbitrary<EnvelopeLocation> = fc.record({
	table: fc.string(),
	id: fc.string(),
	profileId: fc.string(),
	field: fc.string(),
});

// What a sealed record holds: JSON-like plain data. msgpack writes -0 as 0,
// as JSON does, so values pass through JSON once to compare like for like.
const valueArb = fc
	.jsonValue({ maxDepth: 3 })
	.map((value) => JSON.parse(JSON.stringify(value)) as unknown);

const hasProtoKey = (value: unknown): boolean =>
	typeof value === "object" &&
	value !== null &&
	Object.entries(value).some(
		([key, child]) => key === "__proto__" || hasProtoKey(child),
	);

// Values sealValue accepts; the first property covers the rest.
const sealableArb = valueArb.filter((value) => !hasProtoKey(value));

const expectEnvelopeError = async (open: () => Promise<unknown>) => {
	await expect(open()).rejects.toBeInstanceOf(EnvelopeError);
};

describe("envelope properties", () => {
	it("opens what it sealed, or refuses to seal it", async () => {
		const keys = await keysPromise;
		await fc.assert(
			fc.asyncProperty(locationArb, valueArb, async (location, value) => {
				if (hasProtoKey(value)) {
					await expectEnvelopeError(() =>
						sealValue(keys, location, value),
					);
					return;
				}
				const envelope = await sealValue(keys, location, value);
				expect(await openValue(keys, location, envelope)).toEqual(
					value,
				);
			}),
		);
	});

	it("rejects an envelope opened at any other location", async () => {
		const keys = await keysPromise;
		await fc.assert(
			fc.asyncProperty(
				locationArb,
				locationArb,
				sealableArb,
				async (sealedAt, openedAt, value) => {
					fc.pre(
						JSON.stringify(sealedAt) !== JSON.stringify(openedAt),
					);
					const envelope = await sealValue(keys, sealedAt, value);
					await expectEnvelopeError(() =>
						openValue(keys, openedAt, envelope),
					);
				},
			),
		);
	});

	it("rejects any single changed byte", async () => {
		const keys = await keysPromise;
		const location: EnvelopeLocation = {
			table: "notes",
			id: "n1",
			profileId: "p1",
			field: "content",
		};
		await fc.assert(
			fc.asyncProperty(
				sealableArb,
				fc.nat(),
				fc.integer({ min: 1, max: 255 }),
				async (value, position, flip) => {
					const envelope = await sealValue(keys, location, value);
					envelope[position % envelope.length] ^= flip;
					await expectEnvelopeError(() =>
						openValue(keys, location, envelope),
					);
				},
			),
		);
	});

	it("fails arbitrary bytes with EnvelopeError only", async () => {
		const keys = await keysPromise;
		const location: EnvelopeLocation = {
			table: "t",
			id: "i",
			profileId: "p",
			field: "f",
		};
		// Half the inputs start with a valid header, so the decrypt path runs
		// too, not only the header checks.
		const bytesArb = fc.oneof(
			fc.uint8Array({ maxLength: 96, size: "max" }),
			fc
				.uint8Array({ maxLength: 96, size: "max" })
				.map(
					(rest) => new Uint8Array([0x4c, 0x4c, 0x45, 1, 1, ...rest]),
				),
		);
		await fc.assert(
			fc.asyncProperty(bytesArb, async (bytes) => {
				try {
					expect(readEnvelopeHeader(bytes)).toEqual({
						format: 1,
						keyId: bytes[4],
					});
				} catch (error) {
					expect(error).toBeInstanceOf(EnvelopeError);
				}
				await expectEnvelopeError(() =>
					openValue(keys, location, bytes),
				);
			}),
		);
	});
});

describe("URL normalization properties", () => {
	it("is idempotent and ignores the fragment", () => {
		fc.assert(
			fc.property(
				fc.webUrl({ withQueryParameters: true, withFragments: true }),
				fc.webFragments(),
				(url, fragment) => {
					const once = normalizeUrl(url);
					expect(normalizeUrl(once)).toBe(once);
					const [base] = url.split("#");
					expect(normalizeUrl(`${base}#${fragment}`)).toBe(
						normalizeUrl(base),
					);
				},
			),
		);
	});
});
