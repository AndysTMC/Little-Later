import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LINT_BOOLEAN, LTHEME } from "little-shared/enums";
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
	const totalLength = 4 + profileBytes.length + 4 + avatar.length + 4 + vault.length;
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
			new Uint8Array([1, 2, 3, 4]),
		);

		await importData(blob);

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
			new Uint8Array([1]),
		);
		await expect(importData(blob)).rejects.toThrow("missing name");
	});
});
