import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LAI_PROVIDERS } from "little-shared/enums";
import { LINITIAL_USER_SETTINGS } from "little-shared/constants";
import { db } from "../../src/utils/db";
import { createReadableExportPayload } from "../../src/services/dataExchange";
import { applyUnlockedSession } from "../../src/services/settings";
import { createUser, unlockUser } from "../../src/services/user";

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

describe("readable export redaction", () => {
	beforeEach(async () => {
		chromeStore.clear();
		await db.delete();
		await db.open();
	});

	it("omits the live AI API key from plaintext exports", async () => {
		const userId = await createUser("Alice", null);
		await unlockUser(userId);
		await applyUnlockedSession(userId, {
			...LINITIAL_USER_SETTINGS.value,
			ai: {
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: "https://example.invalid/v1",
				apiKey: "sk-secret-do-not-leak",
				model: "test-model",
			},
		});

		const payload = await createReadableExportPayload();
		expect(payload.userSettings.ai.apiKey).toBe("");
		expect(JSON.stringify(payload)).not.toContain("sk-secret-do-not-leak");
	});

	it("does not include another profile's avatar in a readable export", async () => {
		const currentId = await createUser("Current", null);
		const otherId = await createUser("Other", null);
		await unlockUser(currentId);
		await db.userAvatarTbl.put({
			userId: currentId,
			blob: new Blob(["current-avatar"], { type: "image/png" }),
		});
		await db.userAvatarTbl.put({
			userId: otherId,
			blob: new Blob(["other-secret-avatar"], { type: "image/png" }),
		});

		const payload = await createReadableExportPayload();
		const serialized = JSON.stringify(payload);
		expect(serialized).not.toContain("other-secret-avatar");
		const avatarRows = (
			payload.db as {
				data?: {
					data?: Array<{ tableName?: string; rows?: unknown[] }>;
				};
			}
		).data?.data?.find(
			(table) => table.tableName === "userAvatarTbl",
		)?.rows;
		if (avatarRows) {
			expect(
				avatarRows.every((row) => {
					const userId = (row as { userId?: number }).userId;
					return userId === currentId;
				}),
			).toBe(true);
		}
	});
});
