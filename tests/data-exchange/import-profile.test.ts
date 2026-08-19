import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	LEMPTY_VAULT_DATA_POST_DECRYPT,
	LINITIAL_USER_SETTINGS,
} from "little-shared/constants";
import { LINT_BOOLEAN, LTHEME } from "little-shared/enums";
import { blobToUint8Array, encrypt } from "little-shared/utils/crypto";
import { db } from "../../src/utils/db";
import { importData } from "../../src/services/dataExchange";
import { createUser } from "../../src/services/user";

vi.mock("../../src/utils/chrome", () => ({
	getChromeStorageRecords: vi.fn(async (records) => records),
	setChromeStorageRecords: vi.fn(async () => {}),
}));

const buildImportBlob = (
	profile: Record<string, unknown>,
	avatar: Uint8Array,
	vault: Uint8Array,
): Blob => {
	const profileBytes = new TextEncoder().encode(JSON.stringify(profile));
	const totalLength =
		4 + profileBytes.length + 4 + avatar.length + 4 + vault.length;
	const combined = new Uint8Array(totalLength);
	const view = new DataView(combined.buffer);
	let offset = 0;
	view.setUint32(offset, profileBytes.length, true);
	offset += 4;
	combined.set(profileBytes, offset);
	offset += profileBytes.length;
	view.setUint32(offset, avatar.length, true);
	offset += 4;
	combined.set(avatar, offset);
	offset += avatar.length;
	view.setUint32(offset, vault.length, true);
	offset += 4;
	combined.set(vault, offset);
	return new Blob([combined]);
};

const IMPORT_PASSWORD = "import-secret";

const buildEncryptedVaultBytes = async (): Promise<Uint8Array> => {
	const vault = await encrypt(IMPORT_PASSWORD, {
		tables: LEMPTY_VAULT_DATA_POST_DECRYPT.value,
		userSettings: LINITIAL_USER_SETTINGS.value,
	});
	return await blobToUint8Array(vault);
};

describe("importData profile isolation", () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
	});

	it("assigns a new userId and never marks the import current", async () => {
		const existingId = await createUser("Keep", null);
		const blob = buildImportBlob(
			{
				userId: existingId,
				name: "Imported",
				theme: LTHEME.LIGHT,
				isCurrent: LINT_BOOLEAN.TRUE,
			},
			new Uint8Array(),
			await buildEncryptedVaultBytes(),
		);

		await importData(blob, IMPORT_PASSWORD);

		const existing = await db.userProfileTbl.get(existingId);
		const imported = (await db.userProfileTbl.toArray()).find(
			(profile) => profile.name === "Imported",
		);

		expect(existing?.name).toBe("Keep");
		expect(imported).toBeDefined();
		expect(imported?.userId).not.toBe(existingId);
		expect(imported?.isCurrent).toBe(LINT_BOOLEAN.FALSE);
	});

	it("rejects a profile without a name", async () => {
		const blob = buildImportBlob(
			{ userId: 99, theme: LTHEME.LIGHT },
			new Uint8Array(),
			await buildEncryptedVaultBytes(),
		);
		await expect(importData(blob, IMPORT_PASSWORD)).rejects.toThrow(
			"missing name",
		);
	});

	it("requires a password before reading the backup", async () => {
		const blob = buildImportBlob(
			{ name: "Imported", theme: LTHEME.LIGHT },
			new Uint8Array(),
			await buildEncryptedVaultBytes(),
		);
		await expect(importData(blob)).rejects.toThrow("password is required");
	});

	it("rejects an oversized profile section before writing anything", async () => {
		await createUser("Keep", null);
		const existingCount = await db.userProfileTbl.count();
		const oversized = new Uint8Array(4 + 8);
		const view = new DataView(oversized.buffer);
		view.setUint32(0, 70 * 1024, true);
		await expect(
			importData(new Blob([oversized]), IMPORT_PASSWORD),
		).rejects.toThrow("Invalid profile length");
		expect(await db.userProfileTbl.count()).toBe(existingCount);
	});
});
