import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEMPTY_PASSWORD } from "little-shared/constants";
import { LINT_BOOLEAN } from "little-shared/enums";
import { db } from "../../src/utils/db";
import {
	createImportableExportBlob,
	importData,
} from "../../src/services/dataExchange";
import {
	createUser,
	getCurrentUserProfile,
	lockUser,
	unlockUser,
} from "../../src/services/user";

vi.mock("../../src/utils/chrome", () => ({
	getChromeStorageRecords: vi.fn(async (records) => records),
	setChromeStorageRecords: vi.fn(async () => {}),
}));

const LOCK_PASSWORD = "correct-horse-battery";

describe("importable export password protection", () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
	});

	const createLockedWorkingProfile = async (): Promise<number> => {
		const userId = await createUser("Alice", null);
		await unlockUser(userId);
		await db.noteTbl.add({ content: "secret-note" });
		await lockUser({ password: LOCK_PASSWORD });
		await unlockUser(userId, LOCK_PASSWORD);
		return userId;
	};

	it("round-trips live data with the lock password", async () => {
		const userId = await createLockedWorkingProfile();
		const blob = await createImportableExportBlob(LOCK_PASSWORD);

		await importData(blob, LOCK_PASSWORD);

		const current = await getCurrentUserProfile();
		const imported = (await db.userProfileTbl.toArray()).find(
			(profile) => profile.name === "Alice" && profile.userId !== userId,
		);
		expect(current?.userId).toBe(userId);
		expect(imported).toBeDefined();
		expect(imported?.isCurrent).toBe(LINT_BOOLEAN.FALSE);

		await lockUser({ password: LOCK_PASSWORD });
		await unlockUser(imported!.userId, LOCK_PASSWORD);
		const notes = await db.noteTbl.toArray();
		expect(notes.some((note) => note.content === "secret-note")).toBe(true);
		expect(await getCurrentUserProfile()).toMatchObject({
			userId: imported!.userId,
		});
	});

	it("rejects empty, sentinel, and wrong export passwords", async () => {
		await createLockedWorkingProfile();
		await expect(createImportableExportBlob("")).rejects.toThrow(
			"lock password is required",
		);
		await expect(
			createImportableExportBlob(LEMPTY_PASSWORD),
		).rejects.toThrow("lock password is required");
		await expect(
			createImportableExportBlob("wrong-password"),
		).rejects.toThrow("does not match");
	});

	it("rejects a wrong import password without creating a profile", async () => {
		await createLockedWorkingProfile();
		const blob = await createImportableExportBlob(LOCK_PASSWORD);
		const beforeCount = await db.userProfileTbl.count();
		await expect(importData(blob, "wrong-password")).rejects.toThrow(
			"password is wrong or the file is damaged",
		);
		expect(await db.userProfileTbl.count()).toBe(beforeCount);
	});

	it("rejects a corrupted backup without creating a profile", async () => {
		await createLockedWorkingProfile();
		const blob = await createImportableExportBlob(LOCK_PASSWORD);
		const bytes = new Uint8Array(await blob.arrayBuffer());
		bytes[bytes.length - 1] ^= 0xff;
		const beforeCount = await db.userProfileTbl.count();
		await expect(
			importData(new Blob([bytes]), LOCK_PASSWORD),
		).rejects.toThrow("password is wrong or the file is damaged");
		expect(await db.userProfileTbl.count()).toBe(beforeCount);
	});

	it("does not allow passwordless profiles to make importable exports", async () => {
		const userId = await createUser("Open", null);
		await unlockUser(userId);
		await expect(
			createImportableExportBlob("any-password"),
		).rejects.toThrow("does not match");
	});
});
