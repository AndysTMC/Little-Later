import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LINT_BOOLEAN } from "little-shared/enums";
import { db } from "../../src/utils/db";
import {
	createUser,
	deleteUser,
	getCurrentUserProfile,
} from "../../src/services/user";

vi.mock("../../src/utils/chrome", () => ({
	getChromeStorageRecords: vi.fn(async (records) => records),
	setChromeStorageRecords: vi.fn(async () => {}),
}));

describe("user profile isolation", () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
	});

	it("rejects a blank profile name", async () => {
		await expect(createUser("   ", null)).rejects.toThrow(/name/i);
		expect(await db.userProfileTbl.count()).toBe(0);
	});

	it("does not wipe another profile's live tables when deleting a locked profile", async () => {
		const currentUserId = await createUser("Current", null);
		await db.userProfileTbl.update(currentUserId, {
			isCurrent: LINT_BOOLEAN.TRUE,
		});
		await db.noteTbl.add({ content: "keep me" });

		const otherUserId = await createUser("Other", null);
		await deleteUser(otherUserId);

		const remainingNotes = await db.noteTbl.toArray();
		const currentUser = await getCurrentUserProfile();

		expect(currentUser?.userId).toBe(currentUserId);
		expect(remainingNotes).toHaveLength(1);
		expect(remainingNotes[0]?.content).toBe("keep me");
		expect(await db.userProfileTbl.get(otherUserId)).toBeUndefined();
	});

	it("clears live tables only when deleting the current user", async () => {
		const currentUserId = await createUser("Current", null);
		await db.userProfileTbl.update(currentUserId, {
			isCurrent: LINT_BOOLEAN.TRUE,
		});
		await db.noteTbl.add({ content: "gone soon" });

		await deleteUser(currentUserId);

		expect(await db.noteTbl.count()).toBe(0);
		expect(await getCurrentUserProfile()).toBeUndefined();
		const leftoverCurrent = await db.userProfileTbl
			.where("isCurrent")
			.equals(LINT_BOOLEAN.TRUE)
			.count();
		expect(leftoverCurrent).toBe(0);
	});
});
