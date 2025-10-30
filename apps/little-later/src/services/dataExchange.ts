import { db, exportLLDB } from "../utils/db";
import { getUserSettings } from "./settings";
import {
	LEMPTY_VAULT_DATA_POST_DECRYPT,
	LEMPTY_PASSWORD,
} from "little-shared/constants";
import {
	LUserProfile,
	LVaultDataPostDecrypt,
	LVaultDataPostDecryptTables,
} from "little-shared/types";
import { encrypt } from "little-shared/utils/crypto";
import { getCurrentUserProfile, getUserAvatar } from "./user";
import { LINT_BOOLEAN } from "little-shared/enums";
import { localFetch } from "../utils/littleLocal";
export const exportDataImportable = async (): Promise<void> => {
	const currentUserProfile = await getCurrentUserProfile();
	if (!currentUserProfile) throw new Error("No current user profile found");
	const userSettings = await getUserSettings();
	const userVaultPostDecrypt: LVaultDataPostDecrypt = {
		tables: LEMPTY_VAULT_DATA_POST_DECRYPT.value,
		userSettings: userSettings,
	};
	for (const key of Object.keys(userVaultPostDecrypt.tables)) {
		userVaultPostDecrypt.tables[key as keyof LVaultDataPostDecryptTables] =
			await db.table(key).toArray();
	}
	const userVaultDataPostEncrypt = await encrypt<LVaultDataPostDecrypt>(
		LEMPTY_PASSWORD,
		userVaultPostDecrypt,
	);
	const avatarBlob =
		(await getUserAvatar(currentUserProfile.userId)) ?? new Blob();
	const avatarBuffer = await avatarBlob.arrayBuffer();
	currentUserProfile.isCurrent = LINT_BOOLEAN.FALSE;
	const profileJsonBlob = new Blob([JSON.stringify(currentUserProfile)], {
		type: "application/json",
	});
	const profileJsonBuffer = await profileJsonBlob.arrayBuffer();
	const vaultBuffer = await userVaultDataPostEncrypt.arrayBuffer();
	const profileLength = new Uint32Array([profileJsonBuffer.byteLength]);
	const avatarLength = new Uint32Array([avatarBuffer.byteLength]);
	const vaultLength = new Uint32Array([vaultBuffer.byteLength]);
	const totalLength =
		4 +
		profileJsonBuffer.byteLength +
		4 +
		avatarBuffer.byteLength +
		4 +
		vaultBuffer.byteLength;
	const combined = new Uint8Array(totalLength);
	let offset = 0;
	combined.set(new Uint8Array(profileLength.buffer), offset);
	offset += 4;
	combined.set(new Uint8Array(profileJsonBuffer), offset);
	offset += profileJsonBuffer.byteLength;
	combined.set(new Uint8Array(avatarLength.buffer), offset);
	offset += 4;
	combined.set(new Uint8Array(avatarBuffer), offset);
	offset += avatarBuffer.byteLength;
	combined.set(new Uint8Array(vaultLength.buffer), offset);
	offset += 4;
	combined.set(new Uint8Array(vaultBuffer), offset);
	offset += vaultBuffer.byteLength;
	const exportableBlob = new Blob([combined], {
		type: "application/octet-stream",
	});
	downloadBlob(exportableBlob, "Little-Later-Importable.lldat");
};

export const exportDataReadable = async (): Promise<void> => {
	const dbBlob = await exportLLDB();
	const dbJSONString = await dbBlob.text();
	const dbJSON = JSON.parse(dbJSONString);
	const userSettings = await getUserSettings();
	const exportable = {
		db: dbJSON,
		userSettings,
	};
	const exportableBlob = new Blob([JSON.stringify(exportable, null, 2)], {
		type: "application/json",
	});
	downloadBlob(exportableBlob, "Little-Later-Readable.json");
};

const downloadBlob = (blob: Blob, filename: string): void => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
};

export const importData = async (blob: Blob): Promise<void> => {
	const buffer = await blob.arrayBuffer();
	const response = await localFetch("/note", {
		method: "POST",
		body: buffer,
		headers: { "Content-Type": "application/octet-stream" },
	});
	if (response.use) {
		return;
	}
	const view = new DataView(buffer);
	let offset = 0;
	if (offset + 4 > buffer.byteLength) {
		throw new Error("Invalid import file: too short for profile length");
	}
	const profileLength = view.getUint32(offset, true);
	offset += 4;
	if (offset + profileLength > buffer.byteLength) {
		throw new Error("Invalid profile length");
	}
	const profileBytes = new Uint8Array(buffer, offset, profileLength);
	offset += profileLength;
	if (offset + 4 > buffer.byteLength) {
		throw new Error("Invalid import file: too short for avatar length");
	}
	const avatarLength = view.getUint32(offset, true);
	offset += 4;
	if (offset + avatarLength > buffer.byteLength) {
		throw new Error("Invalid avatar length");
	}
	const avatarBytes = new Uint8Array(buffer, offset, avatarLength);
	const avatarBlob = new Blob([avatarBytes]);
	offset += avatarLength;
	if (offset + 4 > buffer.byteLength) {
		throw new Error("Invalid import file: too short for vault length");
	}
	const vaultLength = view.getUint32(offset, true);
	offset += 4;
	if (offset + vaultLength > buffer.byteLength) {
		throw new Error("Invalid vault length");
	}
	const vaultBytes = new Uint8Array(buffer, offset, vaultLength);
	const userVaultDataPostEncrypt = new Blob([vaultBytes], {
		type: "application/octet-stream",
	});
	offset += vaultLength;
	if (offset !== buffer.byteLength) {
		throw new Error("Extra data in the import file");
	}
	let profileJson;
	try {
		profileJson = JSON.parse(new TextDecoder().decode(profileBytes));
	} catch {
		throw new Error("Failed to parse user profile JSON");
	}
	if (!profileJson.userId) {
		throw new Error("Invalid user profile: missing userId");
	}
	const currentUserProfile: LUserProfile = profileJson;

	await db.userProfileTbl.put(currentUserProfile, currentUserProfile.userId);
	await db.userVaultTbl.put({
		userId: currentUserProfile.userId,
		data: userVaultDataPostEncrypt,
	});
	await db.userAvatarTbl.put({
		userId: currentUserProfile.userId,
		blob: avatarBlob,
	});
};
