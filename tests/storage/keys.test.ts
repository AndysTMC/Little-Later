// @vitest-environment node
// Node, not jsdom: see profiles.test.ts.
import { describe, expect, it } from "vitest";
import {
	EnvelopeError,
	openBytes,
	randomKeyBytes,
} from "little-shared/utils/envelope";
import {
	importProfileKeys,
	openAsset,
	openBody,
	sealAsset,
	sealBody,
} from "../../src/storage/keys";
import { toBase64 } from "../../src/storage/session";

const keysFor = (profileId: string) =>
	importProfileKeys({
		profileId,
		currentKeyId: 1,
		rootKeys: { "1": toBase64(randomKeyBytes()) },
		indexKey: toBase64(randomKeyBytes()),
	});

describe("assets", () => {
	it("round-trips bytes under the asset subkey, not the content subkey", async () => {
		const keys = await keysFor("p");
		const bytes = new Uint8Array([1, 2, 3, 250]);
		const { keyId, body } = await sealAsset(keys, "a1", bytes);
		expect(keyId).toBe(1);
		expect(await openAsset(keys, "a1", body)).toEqual(bytes);

		const location = {
			table: "assets",
			id: "a1",
			profileId: "p",
			field: "body",
		};
		await expect(
			openBytes(keys.current.content, location, body),
		).rejects.toThrow(EnvelopeError);
		expect(await openBytes(keys.current.asset, location, body)).toEqual(
			bytes,
		);
	});

	it("binds an asset to its id", async () => {
		const keys = await keysFor("p");
		const { body } = await sealAsset(keys, "a1", new Uint8Array([1]));
		await expect(openAsset(keys, "a2", body)).rejects.toThrow(
			EnvelopeError,
		);
	});
});

describe("bodies", () => {
	it("binds a body to its table, id and profile", async () => {
		const keys = await keysFor("p");
		const { body } = await sealBody(keys, "notes", "n1", { text: "x" });
		expect(await openBody(keys, "notes", "n1", body)).toEqual({
			text: "x",
		});
		await expect(openBody(keys, "tasks", "n1", body)).rejects.toThrow(
			EnvelopeError,
		);
		await expect(openBody(keys, "notes", "n2", body)).rejects.toThrow(
			EnvelopeError,
		);
	});
});
