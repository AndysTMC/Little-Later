import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEMPTY_PASSWORD } from "little-shared/constants";
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
		expect(await checkLockPassword(passwordless, "")).toEqual({
			kind: "current",
		});
		expect(await checkLockPassword(passwordless, "fresh")).toEqual({
			kind: "new",
		});

		const userId = await createProtectedProfile("secret");
		await unlockUser(userId, "secret");
		expect(await checkLockPassword(userId, "secret")).toEqual({
			kind: "current",
		});
		expect(await checkLockPassword(userId, "secrte")).toEqual({
			kind: "new",
		});
		expect(await checkLockPassword(userId, "")).toEqual({ kind: "remove" });
	});

	it("rejects the reserved sentinel and passwords with outer spaces", async () => {
		const userId = await createUser("Di", null);
		expect(await checkLockPassword(userId, LEMPTY_PASSWORD)).toMatchObject({
			kind: "invalid",
		});
		expect(await checkLockPassword(userId, " secret")).toMatchObject({
			kind: "invalid",
		});
		await unlockUser(userId);
		await expect(lockUser({ password: LEMPTY_PASSWORD })).rejects.toThrow(
			/reserved/,
		);
		await expect(lockUser({ password: "secret " })).rejects.toThrow(
			/space/,
		);
	});

	it("treats a profile with no vault yet as having no password", async () => {
		const userId = await createUser("Ed", null);
		await db.userVaultTbl.delete(userId);
		expect(await checkLockPassword(userId, "")).toEqual({
			kind: "current",
		});
		expect(await checkLockPassword(userId, "fresh")).toEqual({
			kind: "new",
		});
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
