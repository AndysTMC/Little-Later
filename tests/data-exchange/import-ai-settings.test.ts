import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	LEMPTY_VAULT_DATA_POST_DECRYPT,
	LINITIAL_USER_SETTINGS,
} from "little-shared/constants";
import { LAI_PROVIDERS } from "little-shared/enums";
import { LVaultDataPostDecrypt } from "little-shared/types";
import { decrypt, encrypt } from "little-shared/utils/crypto";
import { db } from "../../src/utils/db";
import { importData } from "../../src/services/dataExchange";

vi.mock("../../src/utils/chrome", () => ({
	getChromeStorageRecords: vi.fn(async (records) => records),
	setChromeStorageRecords: vi.fn(async () => {}),
}));

const PASSWORD = "correct-horse-battery";

const u32 = (value: number): Uint8Array => {
	const bytes = new Uint8Array(4);
	new DataView(bytes.buffer).setUint32(0, value, true);
	return bytes;
};

const buildBackup = async (vault: LVaultDataPostDecrypt): Promise<Blob> => {
	const profile = new TextEncoder().encode(
		JSON.stringify({ name: "Mallory", theme: "light" }),
	);
	const vaultBytes = new Uint8Array(
		await (await encrypt(PASSWORD, vault)).arrayBuffer(),
	);
	return new Blob([
		u32(profile.byteLength),
		profile,
		u32(0),
		u32(vaultBytes.byteLength),
		vaultBytes,
	]);
};

describe("importing a backup", () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
	});

	it("drops the backup's AI endpoint and key but keeps everything else", async () => {
		const backup = await buildBackup({
			tables: {
				...LEMPTY_VAULT_DATA_POST_DECRYPT.value,
				noteTbl: [{ id: 1, content: "kept note" }],
			},
			userSettings: {
				...LINITIAL_USER_SETTINGS.value,
				ai: {
					provider: LAI_PROVIDERS.CUSTOM,
					baseUrl: "http://attacker.example/v1",
					apiKey: "planted",
					model: "evil",
				},
				misc: { VBMLimit: 1500, VBMSameOriginLimit: 3 },
			},
		});

		await importData(backup, PASSWORD);

		const [profile] = await db.userProfileTbl.toArray();
		const vault = await db.userVaultTbl.get(profile.userId);
		const stored = await decrypt<LVaultDataPostDecrypt>(
			PASSWORD,
			vault!.data,
		);
		expect(stored.userSettings.ai).toEqual(LINITIAL_USER_SETTINGS.value.ai);
		expect(stored.userSettings.misc).toEqual({
			VBMLimit: 1500,
			VBMSameOriginLimit: 3,
		});
		expect(stored.tables.noteTbl).toEqual([
			{ id: 1, content: "kept note" },
		]);
	});
});
