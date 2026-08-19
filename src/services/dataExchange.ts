import { db, exportLLDB } from "../utils/db";
import { getUserSettings } from "./settings";
import {
	LEMPTY_PASSWORD,
	LEMPTY_VAULT_DATA_POST_DECRYPT,
	LMAX_NAME_LENGTH,
} from "little-shared/constants";
import {
	LUserProfile,
	LUserSettings,
	LVaultDataPostDecrypt,
	LVaultDataPostDecryptTables,
} from "little-shared/types";
import { decrypt, encrypt } from "little-shared/utils/crypto";
import { authenticateUser, getCurrentUserProfile, getUserAvatar } from "./user";
import { LINT_BOOLEAN, LTHEME } from "little-shared/enums";

// Dexie export helpers return slightly different blob-like values across the
// browser, Bun, and jsdom test environments, so these readers stay defensive.
const readBlobText = async (blobLike: unknown): Promise<string> => {
	if (
		blobLike &&
		typeof blobLike === "object" &&
		"text" in blobLike &&
		typeof (blobLike as { text: unknown }).text === "function"
	) {
		return await (blobLike as { text: () => Promise<string> }).text();
	}
	if (
		blobLike &&
		typeof blobLike === "object" &&
		"arrayBuffer" in blobLike &&
		typeof (blobLike as { arrayBuffer: unknown }).arrayBuffer === "function"
	) {
		const bytes = await (
			blobLike as { arrayBuffer: () => Promise<ArrayBuffer> }
		).arrayBuffer();
		return new TextDecoder().decode(bytes);
	}
	if (typeof FileReader !== "undefined" && blobLike instanceof Blob) {
		return await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				if (typeof reader.result === "string") {
					resolve(reader.result);
					return;
				}
				reject(new Error("Could not read exported data."));
			};
			reader.onerror = () =>
				reject(new Error("Could not read exported data."));
			reader.readAsText(blobLike);
		});
	}
	throw new Error("Could not read exported data.");
};

const readBlobArrayBuffer = async (blobLike: unknown): Promise<ArrayBuffer> => {
	if (
		blobLike &&
		typeof blobLike === "object" &&
		"arrayBuffer" in blobLike &&
		typeof (blobLike as { arrayBuffer: unknown }).arrayBuffer === "function"
	) {
		return await (
			blobLike as { arrayBuffer: () => Promise<ArrayBuffer> }
		).arrayBuffer();
	}
	if (typeof FileReader !== "undefined" && blobLike instanceof Blob) {
		return await new Promise<ArrayBuffer>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				if (reader.result instanceof ArrayBuffer) {
					resolve(reader.result);
					return;
				}
				reject(new Error("Could not read exported data."));
			};
			reader.onerror = () =>
				reject(new Error("Could not read exported data."));
			reader.readAsArrayBuffer(blobLike);
		});
	}
	if (
		blobLike &&
		typeof blobLike === "object" &&
		"data" in blobLike &&
		Array.isArray((blobLike as { data?: unknown }).data)
	) {
		const bytes = Uint8Array.from(
			(blobLike as { data: Array<unknown> }).data.filter(
				(item): item is number =>
					typeof item === "number" && Number.isFinite(item),
			),
		);
		return bytes.buffer;
	}
	throw new Error("Could not read exported data.");
};

const requireLockPassword = (
	password: string | undefined,
	action: "export" | "import",
): string => {
	const lockPassword = password?.trim() ?? "";
	if (lockPassword === "" || lockPassword === LEMPTY_PASSWORD) {
		throw new Error(
			action === "export"
				? "A lock password is required to export an importable backup."
				: "A password is required to import this backup.",
		);
	}
	return lockPassword;
};

export const createImportableExportBlob = async (
	password?: string,
): Promise<Blob> => {
	const lockPassword = requireLockPassword(password, "export");
	const currentUserProfile = await getCurrentUserProfile();
	if (!currentUserProfile) throw new Error("No current user profile found");
	const matchesLock = await authenticateUser(
		currentUserProfile.userId,
		lockPassword,
	);
	if (!matchesLock) {
		throw new Error(
			"That password does not match this profile's lock password.",
		);
	}
	const userSettings = await getUserSettings();
	// Importable exports bundle profile metadata, avatar bytes, and the encrypted
	// vault payload into one binary envelope so another device can restore it.
	const userVaultPostDecrypt: LVaultDataPostDecrypt = {
		tables: LEMPTY_VAULT_DATA_POST_DECRYPT.value,
		userSettings: userSettings,
	};
	for (const key of Object.keys(userVaultPostDecrypt.tables)) {
		userVaultPostDecrypt.tables[key as keyof LVaultDataPostDecryptTables] =
			await db.table(key).toArray();
	}
	const userVaultDataPostEncrypt = await encrypt<LVaultDataPostDecrypt>(
		lockPassword,
		userVaultPostDecrypt,
	);
	const avatarBlob =
		(await getUserAvatar(currentUserProfile.userId)) ?? new Blob();
	const avatarBuffer = await readBlobArrayBuffer(avatarBlob);
	const profileForExport = {
		...currentUserProfile,
		isCurrent: LINT_BOOLEAN.FALSE,
	};
	const profileJsonBlob = new Blob([JSON.stringify(profileForExport)], {
		type: "application/json",
	});
	const profileJsonBuffer = await readBlobArrayBuffer(profileJsonBlob);
	const vaultBuffer = await readBlobArrayBuffer(userVaultDataPostEncrypt);
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
	const exportableBlob = new Blob([combined], {
		type: "application/octet-stream",
	});
	return exportableBlob;
};

export const exportDataImportable = async (
	password?: string,
): Promise<void> => {
	const exportableBlob = await createImportableExportBlob(password);
	downloadBlob(exportableBlob, "Little-Later-Importable.lldat");
};

export const createReadableExportPayload = async (): Promise<{
	db: unknown;
	userSettings: LUserSettings;
}> => {
	const dbBlob = await exportLLDB();
	const dbJSONString = await readBlobText(dbBlob);
	const dbJSON = JSON.parse(dbJSONString);
	const userSettings = await getUserSettings();
	return {
		db: dbJSON,
		userSettings: {
			...userSettings,
			ai: {
				...userSettings.ai,
				apiKey: "",
			},
		},
	};
};

export const exportDataReadable = async (): Promise<void> => {
	const exportable = await createReadableExportPayload();
	const exportableBlob = new Blob([JSON.stringify(exportable, null, 2)], {
		type: "application/json",
	});
	downloadBlob(exportableBlob, "Little-Later-Readable.json");
};

const normalizeImportedProfile = (
	value: unknown,
): Pick<LUserProfile, "name" | "theme"> => {
	if (!value || typeof value !== "object") {
		throw new Error("Invalid user profile: expected an object");
	}
	const rawName = (value as { name?: unknown }).name;
	if (typeof rawName !== "string" || rawName.trim() === "") {
		throw new Error("Invalid user profile: missing name");
	}
	const rawTheme = (value as { theme?: unknown }).theme;
	const theme =
		rawTheme === LTHEME.DARK || rawTheme === LTHEME.LIGHT
			? rawTheme
			: LTHEME.LIGHT;
	return {
		name: rawName.trim().slice(0, LMAX_NAME_LENGTH),
		theme,
	};
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

const MAX_IMPORT_PROFILE_BYTES = 64 * 1024;
const MAX_IMPORT_AVATAR_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_VAULT_BYTES = 64 * 1024 * 1024;

export const importData = async (
	blob: Blob,
	password?: string,
): Promise<void> => {
	const lockPassword = requireLockPassword(password, "import");
	const buffer = await readBlobArrayBuffer(blob);
	const view = new DataView(buffer);
	let offset = 0;
	if (offset + 4 > buffer.byteLength) {
		throw new Error("Invalid import file: too short for profile length");
	}
	const profileLength = view.getUint32(offset, true);
	offset += 4;
	if (
		profileLength === 0 ||
		profileLength > MAX_IMPORT_PROFILE_BYTES ||
		offset + profileLength > buffer.byteLength
	) {
		throw new Error("Invalid profile length");
	}
	const profileBytes = new Uint8Array(buffer, offset, profileLength);
	offset += profileLength;
	if (offset + 4 > buffer.byteLength) {
		throw new Error("Invalid import file: too short for avatar length");
	}
	const avatarLength = view.getUint32(offset, true);
	offset += 4;
	if (
		avatarLength > MAX_IMPORT_AVATAR_BYTES ||
		offset + avatarLength > buffer.byteLength
	) {
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
	if (
		vaultLength === 0 ||
		vaultLength > MAX_IMPORT_VAULT_BYTES ||
		offset + vaultLength > buffer.byteLength
	) {
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
	try {
		const decrypted = await decrypt<unknown>(
			lockPassword,
			userVaultDataPostEncrypt,
		);
		if (!decrypted || typeof decrypted !== "object") {
			throw new Error("Invalid vault payload");
		}
	} catch {
		throw new Error(
			"Couldn't open this backup. The password is wrong or the file is damaged.",
		);
	}
	let profileJson;
	try {
		profileJson = JSON.parse(new TextDecoder().decode(profileBytes));
	} catch {
		throw new Error("Failed to parse user profile JSON");
	}
	const importedProfile = normalizeImportedProfile(profileJson);
	await db.transaction(
		"rw",
		[db.userProfileTbl, db.userVaultTbl, db.userAvatarTbl],
		async () => {
			const userId = await db.userProfileTbl.add({
				name: importedProfile.name,
				theme: importedProfile.theme,
				isCurrent: LINT_BOOLEAN.FALSE,
			});
			await db.userVaultTbl.put({
				userId,
				data: userVaultDataPostEncrypt,
			});
			await db.userAvatarTbl.put({
				userId,
				blob: avatarBlob,
			});
		},
	);
};
