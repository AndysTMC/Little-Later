import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LAI_PROVIDERS } from "little-shared/enums";
import { LINITIAL_USER_SETTINGS } from "little-shared/constants";
import { db } from "../../src/utils/db";
import { getActiveUserId, getUserSettings } from "../../src/services/settings";
import {
	createUser,
	reconcileActiveSession,
	unlockUser,
} from "../../src/services/user";

const chromeStore = vi.hoisted(() => new Map<string, unknown>());

vi.mock("../../src/utils/chrome", () => ({
	getChromeStorageRecords: vi.fn(async (records: Record<string, unknown>) => {
		const result = { ...records };
		for (const key of Object.keys(records)) {
			if (chromeStore.has(key)) {
				result[key] = chromeStore.get(key);
			}
		}
		return result;
	}),
	setChromeStorageRecords: vi.fn(async (records: Record<string, unknown>) => {
		for (const [key, value] of Object.entries(records)) {
			chromeStore.set(key, value);
		}
	}),
}));

describe("active session reconciliation", () => {
	beforeEach(async () => {
		chromeStore.clear();
		await db.delete();
		await db.open();
	});

	it("drops the previous profile's settings when the Dexie current user does not match", async () => {
		const currentId = await createUser("Current", null);
		await unlockUser(currentId);
		chromeStore.set("userSettings", {
			...LINITIAL_USER_SETTINGS.value,
			ai: {
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: "https://other-profile.invalid/v1",
				apiKey: "sk-from-other-profile",
				model: "leaked",
			},
		});
		chromeStore.set("activeUserId", currentId + 99);

		await reconcileActiveSession();

		expect(await getActiveUserId()).toBe(currentId);
		expect((await getUserSettings()).ai.apiKey).toBe("");
	});
});
