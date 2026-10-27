import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/utils/db";
import {
	checkLockPassword,
	createUser,
	deleteUser,
	lockUser,
	unlockUser,
} from "../../src/services/user";

vi.mock("../../src/utils/chrome", () => ({
	getChromeStorageRecords: vi.fn(async (records) => records),
	setChromeStorageRecords: vi.fn(async () => {}),
}));

const createProtectedProfile = async (password: string): Promise<number> => {
	const userId = await createUser("Ada", null);
	await unlockUser(userId);
	await lockUser({ password });
	return userId;
};

describe("password guards", () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
	});

	it("tells the lock screen whether a typed password is current, new, or a removal", async () => {
		const passwordless = await createUser("Bo", null);
		expect(await checkLockPassword(passwordless, "")).toBe("current");
		expect(await checkLockPassword(passwordless, "fresh")).toBe("new");

		const userId = await createProtectedProfile("secret");
		await unlockUser(userId, "secret");
		expect(await checkLockPassword(userId, "secret")).toBe("current");
		expect(await checkLockPassword(userId, "secrte")).toBe("new");
		expect(await checkLockPassword(userId, "")).toBe("remove");
	});

	it("refuses to delete a protected profile without its password", async () => {
		const userId = await createProtectedProfile("secret");

		await expect(deleteUser(userId)).rejects.toThrow(/password/);
		await expect(deleteUser(userId, "wrong")).rejects.toThrow(/password/);
		expect(await db.userProfileTbl.get(userId)).toBeDefined();
		expect(await db.userVaultTbl.get(userId)).toBeDefined();

		await deleteUser(userId, "secret");
		expect(await db.userProfileTbl.get(userId)).toBeUndefined();
		expect(await db.userVaultTbl.get(userId)).toBeUndefined();
	});

	it("still deletes a passwordless profile without a password", async () => {
		const userId = await createUser("Cy", null);
		await deleteUser(userId);
		expect(await db.userProfileTbl.get(userId)).toBeUndefined();
	});
});
