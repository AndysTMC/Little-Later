import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands } from "../../src/background/commands";
import {
	createCommandContext,
	createDispatcher,
	createSerialQueue,
	type Dispatch,
} from "../../src/background/commands/registry";
import { importProfileKeys } from "../../src/storage/keys";
import { littleDB } from "../../src/storage/pageDB";
import { getImageBlob, listImages } from "../../src/storage/repositories";
import { sessionStore, toBase64 } from "../../src/storage/session";
import { createBackup, importBackup } from "../../src/services/backup";
import { searchImages } from "../../src/popup/records";
import { setLocalDispatch } from "../../src/utils/send";

// Valid 1x1 transparent PNG bytes.
const TINY_PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
	0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
	0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
	0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
	0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe("Milestone 2 — Images vault & backup round-trip", () => {
	let dispatch: Dispatch;

	beforeEach(async () => {
		await littleDB.delete();
		await littleDB.open();
		await sessionStore.clear();
		dispatch = createDispatcher(
			commands,
			createCommandContext(littleDB, sessionStore),
			createSerialQueue(),
		);
		setLocalDispatch(dispatch);
		const created = await dispatch("profile.create", {
			name: "Ada",
			password: null,
		});
		expect(created.ok).toBe(true);
	});

	afterEach(async () => {
		await sessionStore.clear();
		await littleDB.delete();
	});

	it("creates, updates, searches, reads blobs, and deletes encrypted images", async () => {
		const created = await dispatch("image.create", {
			bytesBase64: toBase64(TINY_PNG),
			mimeType: "image/png",
			title: "Architecture diagram",
			sourceUrl: "https://example.com/docs",
			tags: ["Design", "arch"],
		});
		expect(created.ok).toBe(true);
		const imageId = (created.ok ? created.value : null) as { id: string };
		const keys = await importProfileKeys((await sessionStore.get())!);

		const listed = await listImages(littleDB, keys);
		expect(listed).toHaveLength(1);
		expect(listed[0]).toMatchObject({
			id: imageId.id,
			title: "Architecture diagram",
			mimeType: "image/png",
			sourceUrl: "https://example.com/docs",
			tags: ["design", "arch"],
		});

		const blob = await getImageBlob(
			littleDB,
			keys,
			imageId.id,
			"image/png",
		);
		expect(blob).toBeDefined();
		expect(blob?.size).toBe(TINY_PNG.byteLength);

		expect(searchImages(listed, "diagram")).toHaveLength(1);
		expect(searchImages(listed, "#design")).toHaveLength(1);
		expect(searchImages(listed, "unrelated")).toHaveLength(0);

		const updated = await dispatch("image.update", {
			id: imageId.id,
			title: "Updated architecture",
			tags: ["v2"],
		});
		expect(updated.ok).toBe(true);
		const afterUpdate = await listImages(littleDB, keys);
		expect(afterUpdate[0]?.title).toBe("Updated architecture");
		expect(afterUpdate[0]?.tags).toEqual(["v2"]);

		const deleted = await dispatch("image.delete", { id: imageId.id });
		expect(deleted.ok).toBe(true);
		expect(await listImages(littleDB, keys)).toHaveLength(0);
		expect(await littleDB.assets.count()).toBe(0);
	});

	it("rejects disallowed MIME types (such as SVG) and non-http source URLs", async () => {
		const svg = await dispatch("image.create", {
			bytesBase64: toBase64(new TextEncoder().encode("<svg></svg>")),
			mimeType: "image/svg+xml",
			title: "Unsafe SVG",
		});
		expect(svg.ok).toBe(false);

		const badUrl = await dispatch("image.create", {
			bytesBase64: toBase64(TINY_PNG),
			mimeType: "image/png",
			title: "Bad link",
			sourceUrl: "javascript:alert(1)",
		});
		expect(badUrl.ok).toBe(false);
	});

	it("preserves images and their encrypted binary assets across backup export and import", async () => {
		const created = await dispatch("image.create", {
			bytesBase64: toBase64(TINY_PNG),
			mimeType: "image/png",
			title: "Backup screenshot",
			tags: ["backup"],
		});
		expect(created.ok).toBe(true);
		const archive = await createBackup("BackupPass123!");

		// Wipe database and restore from backup.
		await sessionStore.clear();
		await littleDB.delete();
		await littleDB.open();

		await importBackup(archive, "BackupPass123!");
		const [restoredProfile] = await littleDB.profiles.toArray();
		expect(restoredProfile).toBeDefined();
		const unlocked = await dispatch("profile.unlock", {
			profileId: restoredProfile!.id,
			password: "BackupPass123!",
		});
		expect(unlocked.ok).toBe(true);
		const keys2 = await importProfileKeys((await sessionStore.get())!);
		const restoredImages = await listImages(littleDB, keys2);
		expect(restoredImages).toHaveLength(1);
		expect(restoredImages[0]?.title).toBe("Backup screenshot");
		expect(restoredImages[0]?.tags).toEqual(["backup"]);
		const restoredBlob = await getImageBlob(
			littleDB,
			keys2,
			restoredImages[0]!.id,
			"image/png",
		);
		expect(restoredBlob?.size).toBe(TINY_PNG.byteLength);
	});
});
