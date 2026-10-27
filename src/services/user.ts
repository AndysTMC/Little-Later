import {
	LEMPTY_PASSWORD,
	LEMPTY_VAULT_DATA_POST_DECRYPT,
	LINITIAL_USER_SETTINGS,
	LMAX_NAME_LENGTH,
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
	applyUnlockedSession,
	getActiveUserId,
	getUserSettings,
	normalizeUserSettings,
	resetUserSettings,
	updateUserSettings,
} from "./settings";

const VAULT_TABLE_KEYS = [
	"linkTbl",
	"noteTbl",
	"reminderTbl",
	"taskTbl",
	"vbmPreviewTbl",
	"visualBMTbl",
] as const satisfies ReadonlyArray<keyof LVaultDataPostDecryptTables>;

const asUnknownArray = (value: unknown): Array<unknown> =>
	Array.isArray(value) ? value : [];

export const sanitizeVaultData = (value: unknown): LVaultDataPostDecrypt => {
	const raw =
		value && typeof value === "object"
			? (value as { tables?: unknown; userSettings?: unknown })
			: {};
	const tables =
		raw.tables && typeof raw.tables === "object"
			? (raw.tables as Record<string, unknown>)
			: {};
	return {
		tables: {
			linkTbl: asUnknownArray(
				tables.linkTbl,
			) as LVaultDataPostDecryptTables["linkTbl"],
			noteTbl: asUnknownArray(
				tables.noteTbl,
			) as LVaultDataPostDecryptTables["noteTbl"],
			reminderTbl: asUnknownArray(
				tables.reminderTbl,
			) as LVaultDataPostDecryptTables["reminderTbl"],
			taskTbl: asUnknownArray(
				tables.taskTbl,
			) as LVaultDataPostDecryptTables["taskTbl"],
			vbmPreviewTbl: asUnknownArray(
				tables.vbmPreviewTbl,
			) as LVaultDataPostDecryptTables["vbmPreviewTbl"],
			visualBMTbl: asUnknownArray(
				tables.visualBMTbl,
			) as LVaultDataPostDecryptTables["visualBMTbl"],
		},
		userSettings: normalizeUserSettings(raw.userSettings),
	};
};

export const authenticateUser = async (
	id: number,
	password?: string,
): Promise<boolean> => {
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

export type LockPasswordCheck =
	| { kind: "current" }
	| { kind: "new" }
	| { kind: "remove" }
	| { kind: "invalid"; problem: string };

// The sentinel would silently make the profile passwordless, and backups trim
// passwords, so a password with outer spaces could never export or import.
export const getNewLockPasswordProblem = (password: string): string | null => {
	if (password === LEMPTY_PASSWORD) {
		return "That password is reserved. Choose another one.";
	}
	if (password !== password.trim()) {
		return "A password can't start or end with a space.";
	}
	return null;
};

// Locking re-encrypts the vault with whatever was typed, so the lock screen
// must know whether the typed password is the current one, a new one (to be
// typed twice), or empty on a protected profile (removes the password).
export const checkLockPassword = async (
	userId: number,
	password: string,
): Promise<LockPasswordCheck> => {
	const problem =
		password === "" ? null : getNewLockPasswordProblem(password);
	if (problem !== null) {
		return { kind: "invalid", problem };
	}
	let isCurrent: boolean;
	try {
		isCurrent = await authenticateUser(
			userId,
			password === "" ? undefined : password,
		);
	} catch {
		// No vault yet means no password yet: empty locks as before.
		isCurrent = password === "";
	}
	if (isCurrent) {
		return { kind: "current" };
	}
	return password === "" ? { kind: "remove" } : { kind: "new" };
};

export const createUser = async (
	name: string,
	avatar: Blob | null,
): Promise<number> => {
	const trimmedName = name.trim().slice(0, LMAX_NAME_LENGTH);
	if (trimmedName === "") {
		throw new Error("Profile name is required.");
	}
	const vaultDataPostEncrypt = await encrypt(LEMPTY_PASSWORD, {
		tables: LEMPTY_VAULT_DATA_POST_DECRYPT.value,
		userSettings: LINITIAL_USER_SETTINGS.value,
	});
	const userId = await db.transaction(
		"rw",
		[db.userProfileTbl, db.userAvatarTbl, db.userVaultTbl],
		async () => {
			const createdUserId = await db.userProfileTbl.add({
				name: trimmedName,
				theme: LTHEME.LIGHT,
				isCurrent: LINT_BOOLEAN.FALSE,
			});
			await db.userAvatarTbl.add({
				userId: createdUserId,
				blob: avatar,
			});
			await db.userVaultTbl.add({
				userId: createdUserId,
				data: vaultDataPostEncrypt,
			});
			return createdUserId;
		},
	);
	const currentUserProfile = await getCurrentUserProfile();
	if (!currentUserProfile) {
		await updateUserSettings(LINITIAL_USER_SETTINGS.value);
	}
	return userId;
};

export const deleteUser = async (
	userId: number,
	password?: string,
): Promise<void> => {
	const userProfile = await db.userProfileTbl.get(userId);
	if (!userProfile) {
		throw new Error(`No user profile found for ID: ${userId}`);
	}
	if (!(await authenticateUser(userId, password))) {
		throw new Error("Enter this profile's password to delete it.");
	}
	const isDeletingCurrentUser = userProfile.isCurrent === LINT_BOOLEAN.TRUE;
	await db.transaction(
		"rw",
		[
			db.userAvatarTbl,
			db.userVaultTbl,
			db.userProfileTbl,
			db.linkTbl,
			db.noteTbl,
			db.reminderTbl,
			db.taskTbl,
			db.visualBMTbl,
			db.vbmPreviewTbl,
		],
		async () => {
			await db.userAvatarTbl.delete(userProfile.userId);
			await db.userVaultTbl.delete(userProfile.userId);
			await db.userProfileTbl.delete(userProfile.userId);
			if (!isDeletingCurrentUser) {
				return;
			}
			await db.linkTbl.clear();
			await db.noteTbl.clear();
			await db.reminderTbl.clear();
			await db.taskTbl.clear();
			await db.visualBMTbl.clear();
			await db.vbmPreviewTbl.clear();
		},
	);
	if (isDeletingCurrentUser) {
		await resetUserSettings();
	}
};

export const getCurrentUserProfile = async (): Promise<
	LUserProfile | undefined
> => {
	try {
		return await db.userProfileTbl
			.where("isCurrent")
			.equals(LINT_BOOLEAN.TRUE)
			.first();
	} catch (error) {
		console.error("Error fetching current user profile:", error);
		return undefined;
	}
};

export const unlockUser = async (
	id: number,
	password?: string,
): Promise<void> => {
	const currentUserProfile = await getCurrentUserProfile();
	if (currentUserProfile) {
		if (currentUserProfile.userId === id) {
			throw new Error("This profile is already unlocked.");
		}
		throw new Error("Lock the current profile before unlocking another.");
	}
	const userVault = await db.userVaultTbl.get(id);
	if (!userVault) {
		throw new Error(`No user vault found for user ID: ${id}`);
	}
	const userVaultDataPostDecrypt = sanitizeVaultData(
		await decrypt<unknown>(password ?? LEMPTY_PASSWORD, userVault.data),
	);
	const workingTables = [
		db.linkTbl,
		db.noteTbl,
		db.reminderTbl,
		db.taskTbl,
		db.visualBMTbl,
		db.vbmPreviewTbl,
		db.userProfileTbl,
	];
	await db.transaction("rw", workingTables, async () => {
		await db.userProfileTbl.toCollection().modify({
			isCurrent: LINT_BOOLEAN.FALSE,
		});
		for (const key of VAULT_TABLE_KEYS) {
			await db.table(key).clear();
		}
		for (const key of VAULT_TABLE_KEYS) {
			await db.table(key).bulkPut(userVaultDataPostDecrypt.tables[key]);
		}
		await db.userProfileTbl.update(id, {
			isCurrent: LINT_BOOLEAN.TRUE,
		});
	});
	try {
		await applyUnlockedSession(id, userVaultDataPostDecrypt.userSettings);
	} catch {
		// The vault tables already switched. Reset settings rather than
		// leaving the previous profile's AI credentials in chrome.storage.
		await resetUserSettings();
	}
};

export const reconcileActiveSession = async (): Promise<void> => {
	const current = await getCurrentUserProfile();
	const storedUserId = await getActiveUserId();
	if (!current) {
		if (storedUserId !== null) {
			await resetUserSettings();
		}
		return;
	}
	if (storedUserId !== current.userId) {
		// Dexie already belongs to this profile; chrome.storage does not.
		// Drop the previous profile's settings instead of mixing them.
		await applyUnlockedSession(
			current.userId,
			LINITIAL_USER_SETTINGS.value,
		);
	}
};

export const lockUser = async ({
	password,
}: {
	password?: string;
}): Promise<void> => {
	const currentUserProfile = await db.userProfileTbl
		.where("isCurrent")
		.equals(LINT_BOOLEAN.TRUE)
		.first();
	if (!currentUserProfile) {
		throw new Error("No current user profile found");
	}
	const passwordProblem =
		password === undefined ? null : getNewLockPasswordProblem(password);
	if (passwordProblem !== null) {
		throw new Error(passwordProblem);
	}
	const userSettings = await getUserSettings();
	const userVaultPostDecrypt: LVaultDataPostDecrypt = {
		tables: LEMPTY_VAULT_DATA_POST_DECRYPT.value,
		userSettings: userSettings,
	};
	const tableSnapshots = await Promise.all(
		VAULT_TABLE_KEYS.map(
			async (key) => [key, await db.table(key).toArray()] as const,
		),
	);
	for (const [key, rows] of tableSnapshots) {
		userVaultPostDecrypt.tables[key] = rows;
	}
	const userVaultDataPostEncrypt = await encrypt<LVaultDataPostDecrypt>(
		password ?? LEMPTY_PASSWORD,
		userVaultPostDecrypt,
	);
	await db.transaction(
		"rw",
		[
			db.linkTbl,
			db.noteTbl,
			db.reminderTbl,
			db.taskTbl,
			db.visualBMTbl,
			db.vbmPreviewTbl,
			db.userProfileTbl,
			db.userVaultTbl,
		],
		async () => {
			const updated = await db.userVaultTbl.update(
				currentUserProfile.userId,
				{
					data: userVaultDataPostEncrypt,
				},
			);
			if (updated === 0) {
				await db.userVaultTbl.put({
					userId: currentUserProfile.userId,
					data: userVaultDataPostEncrypt,
				});
			}
			for (const key of VAULT_TABLE_KEYS) {
				await db.table(key).clear();
			}
			await db.userProfileTbl.update(currentUserProfile.userId, {
				isCurrent: LINT_BOOLEAN.FALSE,
			});
		},
	);
	try {
		await resetUserSettings();
	} catch {
		try {
			await resetUserSettings();
		} catch {
			// The vault is already locked. Do not report lock as failed.
		}
	}
};

export const updateUserProfile = async (
	userId: number,
	modifications: Partial<LUserProfile>,
): Promise<void> => {
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
	await db.userAvatarTbl.update(userId, { blob: avatar });
};

export const getUserAvatar = async (userId: number): Promise<Blob | null> => {
	const userAvatar = await db.userAvatarTbl.get(userId);
	if (!userAvatar) {
		return null;
	}
	return userAvatar.blob;
};

export const getUserProfiles = async (): Promise<LUserProfile[]> => {
	return await db.userProfileTbl.toArray();
};
