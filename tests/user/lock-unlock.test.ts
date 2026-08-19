import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	LEMPTY_PASSWORD,
	LEMPTY_VAULT_DATA_POST_DECRYPT,
	LINITIAL_USER_SETTINGS,
} from "little-shared/constants";
import { LINT_BOOLEAN } from "little-shared/enums";
import { encrypt } from "little-shared/utils/crypto";
import { db } from "../../src/utils/db";
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

describe("lock, unlock, and profile switching", () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
	});

	it("does not overwrite a live vault when the same profile is already unlocked", async () => {
		const userId = await createUser("Current", null);
		await unlockUser(userId);
		await db.noteTbl.add({ content: "live work" });

		await expect(unlockUser(userId)).rejects.toThrow("already unlocked");

		expect(await getCurrentUserProfile()).toMatchObject({ userId });
		expect((await db.noteTbl.toArray())[0]?.content).toBe("live work");
	});

	it("refuses to unlock another profile while one is current", async () => {
		const currentId = await createUser("Current", null);
		await unlockUser(currentId);
		await db.noteTbl.add({ content: "keep current" });
		const otherId = await createUser("Other", null);

		await expect(unlockUser(otherId)).rejects.toThrow(
			"Lock the current profile before unlocking another.",
		);

		expect(await getCurrentUserProfile()).toMatchObject({
			userId: currentId,
		});
		expect((await db.noteTbl.toArray())[0]?.content).toBe("keep current");
		expect((await db.userProfileTbl.get(otherId))?.isCurrent).toBe(
			LINT_BOOLEAN.FALSE,
		);
	});

	it("does not change live data on a failed unlock", async () => {
		const userId = await createUser("Locked", null);
		await unlockUser(userId);
		await db.noteTbl.add({ content: "private" });
		await lockUser({ password: "secret" });

		expect(await getCurrentUserProfile()).toBeUndefined();
		expect(await db.noteTbl.count()).toBe(0);

		await expect(unlockUser(userId, "wrong")).rejects.toThrow(
			/password|corrupt/i,
		);
		expect(await getCurrentUserProfile()).toBeUndefined();
		expect(await db.noteTbl.count()).toBe(0);
	});

	it("switches profiles without leaking the previous working set", async () => {
		const firstId = await createUser("First", null);
		await unlockUser(firstId);
		await db.noteTbl.add({ content: "first-only" });
		await lockUser({ password: "first-pass" });

		const secondId = await createUser("Second", null);
		await unlockUser(secondId, undefined);
		await db.noteTbl.add({ content: "second-only" });

		expect(
			(await db.noteTbl.toArray()).map((note) => note.content),
		).toEqual(["second-only"]);
		expect(await getCurrentUserProfile()).toMatchObject({
			userId: secondId,
		});

		await lockUser({ password: "second-pass" });
		await unlockUser(firstId, "first-pass");

		expect(
			(await db.noteTbl.toArray()).map((note) => note.content),
		).toEqual(["first-only"]);
		expect(await getCurrentUserProfile()).toMatchObject({
			userId: firstId,
		});
		expect((await db.userProfileTbl.get(secondId))?.isCurrent).toBe(
			LINT_BOOLEAN.FALSE,
		);
	});

	it("ignores extra vault tables so an imported payload cannot rewrite profiles", async () => {
		const keepId = await createUser("Keep", null);
		const targetId = await createUser("Target", null);
		await db.userVaultTbl.put({
			userId: targetId,
			data: await encrypt(LEMPTY_PASSWORD, {
				tables: {
					...LEMPTY_VAULT_DATA_POST_DECRYPT.value,
					noteTbl: [{ content: "from-vault" }],
					userProfileTbl: [
						{
							userId: keepId,
							name: "Hacked",
							theme: "little-light",
							isCurrent: LINT_BOOLEAN.TRUE,
						},
					],
				},
				userSettings: LINITIAL_USER_SETTINGS.value,
			}),
		});

		await unlockUser(targetId);

		expect(await db.userProfileTbl.get(keepId)).toMatchObject({
			name: "Keep",
		});
		expect(
			(await db.userProfileTbl.toArray()).some(
				(profile) => profile.name === "Hacked",
			),
		).toBe(false);
		expect((await db.noteTbl.toArray())[0]?.content).toBe("from-vault");
		expect(await getCurrentUserProfile()).toMatchObject({
			userId: targetId,
		});
	});
});
