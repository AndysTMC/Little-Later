import {
	LEMPTY_PASSWORD,
	LEMPTY_VAULT_DATA_POST_DECRYPT,
	LINITIAL_USER_SETTINGS,
} from "little-shared/constants";
import { encrypt, decrypt } from "little-shared/utils/crypto";
import {
	LUserProfile,
	LVaultDataPostDecrypt,
	LVaultDataPostDecryptTables,
} from "little-shared/types";
import { db } from "../utils/db";
import { LINT_BOOLEAN, LTHEME } from "little-shared/enums";
import {
	getUserSettings,
	resetUserSettings,
	updateUserSettings,
} from "./settings";
import { localFetch } from "../utils/littleLocal";

export const authenticateUser = async (
	id: number,
	password?: string,
): Promise<boolean> => {
	const response = await localFetch("/user/auth", {
		method: "POST",
		body: JSON.stringify({ id, password }),
		headers: { "Content-Type": "application/json" },
	});
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	const currentUserProfile = await db.userProfileTbl.get(id);
	if (!currentUserProfile) {
		throw new Error(`No user profile found for ID: ${id}`);
	}
	const currentUserVault = await db.userVaultTbl
		.where("userId")
		.equals(currentUserProfile.userId)
		.first();
	if (currentUserVault === undefined) {
		throw new Error("No user vault found");
	}
	try {
		await decrypt<LVaultDataPostDecrypt>(
			password ?? LEMPTY_PASSWORD,
			currentUserVault.data,
		);
		return true;
	} catch {
		return false;
	}
};

export const createUser = async (
	name: string,
	avatar: Blob | null,
): Promise<number> => {
	const formData = new FormData();
	formData.append("name", name);
	if (avatar) {
		formData.append("avatar", avatar);
	}
	const response = await localFetch("/user", {
		method: "POST",
		body: formData,
	});
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	const userId = await db.userProfileTbl.add({
		name,
		theme: LTHEME.LIGHT,
		isCurrent: LINT_BOOLEAN.FALSE,
	});
	await db.userAvatarTbl.add({
		userId,
		blob: avatar,
	});
	const vaultDataPostDecrypt: LVaultDataPostDecrypt = {
		tables: LEMPTY_VAULT_DATA_POST_DECRYPT.value,
		userSettings: LINITIAL_USER_SETTINGS.value,
	};
	const vaultDataPostEncrypt = await encrypt(
		LEMPTY_PASSWORD,
		vaultDataPostDecrypt,
	);
	await db.userVaultTbl.add({
		userId,
		data: vaultDataPostEncrypt,
	});
	await updateUserSettings(LINITIAL_USER_SETTINGS.value);
	return userId;
};

export const deleteUser = async (userId: number): Promise<void> => {
	const response = await localFetch("/user" + userId, {
		method: "DELETE",
	});
	if (response.use) {
		return;
	}
	const userProfile = await db.userProfileTbl.get(userId);
	if (!userProfile) {
		throw new Error(`No user profile found for ID: ${userId}`);
	}
	await db.userAvatarTbl.delete(userProfile.userId);
	await db.userVaultTbl.delete(userProfile.userId);
	await db.userProfileTbl.delete(userProfile.userId);
	await db.linkTbl.clear();
	await db.noteTbl.clear();
	await db.reminderTbl.clear();
	await db.taskTbl.clear();
	await db.visualBMTbl.clear();
	await db.vbmPreviewTbl.clear();
	await resetUserSettings();
};

export const getCurrentUserProfile = async (): Promise<
	LUserProfile | undefined
> => {
	const response = await localFetch("/user/current");
	if (response.use) {
		const currentUserProfile = await response.response?.json();
		return currentUserProfile;
	}
	try {
		const currentUserProfile = db.userProfileTbl
			.where("isCurrent")
			.equals(LINT_BOOLEAN.TRUE)
			.first();
		return currentUserProfile;
	} catch (error) {
		console.error("Error fetching current user profile:", error);
		return undefined;
	}
};

export const unlockUser = async (
	id: number,
	password?: string,
): Promise<void> => {
	const response = await localFetch("/user/unlock", {
		method: "POST",
		body: JSON.stringify({ id, password }),
		headers: { "Content-Type": "application/json" },
	});
	if (response.use) {
		return;
	}
	const userVault = await db.userVaultTbl.get(id);
	if (!userVault) {
		throw new Error(`No user vault found for user ID: ${id}`);
	}
	const userVaultDataPostDecrypt = await decrypt<LVaultDataPostDecrypt>(
		password ?? LEMPTY_PASSWORD,
		userVault.data,
	);
	for (const key of Object.keys(userVaultDataPostDecrypt.tables)) {
		await db
			.table(key)
			.bulkPut(
				userVaultDataPostDecrypt.tables[
					key as keyof LVaultDataPostDecryptTables
				],
			);
	}
	await db.userProfileTbl.update(id, {
		isCurrent: LINT_BOOLEAN.TRUE,
	});
	await updateUserSettings(userVaultDataPostDecrypt.userSettings);
};

export const lockUser = async ({
	password,
}: {
	password?: string;
}): Promise<void> => {
	const response = await localFetch("/user/lock", {
		method: "POST",
		body: JSON.stringify({
			password,
		}),
		headers: { "Content-Type": "application/json" },
	});
	if (response.use) {
		return;
	}

	const currentUserProfile = await db.userProfileTbl
		.where("isCurrent")
		.equals(LINT_BOOLEAN.TRUE)
		.first();
	if (!currentUserProfile) {
		throw new Error("No current user profile found");
	}
	const userSettings = await getUserSettings();
	const userVaultPostDecrypt: LVaultDataPostDecrypt = {
		tables: LEMPTY_VAULT_DATA_POST_DECRYPT.value,
		userSettings: userSettings,
	};
	for (const key of Object.keys(userVaultPostDecrypt.tables)) {
		userVaultPostDecrypt.tables[key as keyof LVaultDataPostDecryptTables] =
			await db.table(key).toArray();
		await db.table(key).clear();
	}
	const userVaultDataPostEncrypt = await encrypt<LVaultDataPostDecrypt>(
		password ?? LEMPTY_PASSWORD,
		userVaultPostDecrypt,
	);
	await db.userVaultTbl.update(currentUserProfile.userId, {
		data: userVaultDataPostEncrypt,
	});
	await db.userProfileTbl.update(currentUserProfile.userId, {
		isCurrent: LINT_BOOLEAN.FALSE,
	});
	await resetUserSettings();
};

export const updateUserProfile = async (
	userId: number,
	modifications: Partial<LUserProfile>,
): Promise<void> => {
	const response = await localFetch("/user/" + userId, {
		method: "PATCH",
		body: JSON.stringify({ userId, modifications }),
		headers: { "Content-Type": "application/json" },
	});
	if (response.use) {
		return;
	}
	if (modifications.userId) {
		modifications.userId = undefined;
	}
	if (modifications.isCurrent !== undefined) {
		throw new Error(
			"isCurrent can only be modified through lockUser or unlockUser",
		);
	}
	if (Object.values(modifications).some((value) => value !== undefined)) {
		await db.userProfileTbl.update(userId, modifications);
	}
};

export const updateUserAvatar = async (
	userId: number,
	avatar: Blob | null,
): Promise<void> => {
	const response = await localFetch("/user/avatar/" + userId, {
		method: "PATCH",
		body: avatar,
		headers: { "Content-Type": avatar?.type || "application/octet-stream" },
	});
	if (response.use) {
		return;
	}
	await db.userAvatarTbl.update(userId, { blob: avatar });
};

export const getUserAvatar = async (userId: number): Promise<Blob | null> => {
	const response = await localFetch("/user/avatar/" + userId);
	if (response.use) {
		const result = await response.response?.blob();
		return result ?? null;
	}
	const userAvatar = await db.userAvatarTbl.get(userId);
	if (!userAvatar) {
		return null;
	}
	return userAvatar.blob;
};

export const getUserProfiles = async (): Promise<LUserProfile[]> => {
	const response = await localFetch("/user");
	if (response.use) {
		const result = await response.response?.json();
		return result ?? [];
	}
	return await db.userProfileTbl.toArray();
};
