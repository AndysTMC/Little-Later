import Dexie from "dexie";
import {
	EnvelopeError,
	deriveContentKeys,
	newKdfParams,
	openBytes,
	randomKeyBytes,
	readEnvelopeHeader,
	sealBytes,
	unwrapKey,
	wrapKey,
	type KdfParams,
} from "little-shared/utils/envelope";
import type { LittleDB, ProfileKeyEntry, ProfileRow } from "./schema";
import { toBase64, type SessionStore } from "./session";

// Profiles and their keys (decision 0010, Keys). A profile has a random root
// key and a random index key; a password, when set, only wraps the root key.

const FIRST_KEY_ID = 1;
const DEFAULT_PREFS: ProfileRow["prefs"] = {
	theme: "system",
	autoLockMinutes: 30,
};

export class ProfileError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProfileError";
	}
}

const indexKeyLocation = (profileId: string) => ({
	table: "profiles",
	id: profileId,
	profileId,
	field: "indexKey",
});

// Passing kdf lets tests use a cheap iteration count.
type KeyOptions = { kdf?: () => KdfParams };

// Decision 0007 (A1): null means no password; an empty password, or one
// with outer whitespace, is refused rather than silently stored.
const assertNewPassword = (password: string | null) => {
	if (
		password !== null &&
		(password === "" || password !== password.trim())
	) {
		throw new ProfileError(
			"A password cannot be empty or start or end with a space.",
		);
	}
};

const protect = async (
	root: Uint8Array,
	password: string | null,
	profileId: string,
	keyId: number,
	options: KeyOptions,
): Promise<ProfileKeyEntry> =>
	password === null
		? { keyId, raw: root }
		: {
				keyId,
				wrapped: await wrapKey(
					root,
					password,
					profileId,
					keyId,
					(options.kdf ?? newKdfParams)(),
				),
			};

const readRootKeys = async (
	profile: ProfileRow,
	password: string | null,
): Promise<Map<number, Uint8Array>> => {
	// A profile whose keys were shredded by an interrupted delete has nothing
	// to unlock and nothing a password could verify.
	if (profile.keys.length === 0) {
		throw new ProfileError("This profile has no keys.");
	}
	if (profile.protection === "password" && password === null) {
		throw new ProfileError("This profile needs its password.");
	}
	const roots = new Map<number, Uint8Array>();
	for (const entry of profile.keys) {
		roots.set(
			entry.keyId,
			"raw" in entry
				? entry.raw
				: await unwrapKey(entry.wrapped, password ?? "", profile.id),
		);
	}
	return roots;
};

const getProfile = async (db: LittleDB, profileId: string) => {
	const profile = await db.profiles.get(profileId);
	if (!profile) {
		throw new ProfileError("Profile not found.");
	}
	return profile;
};

const startSession = async (
	session: SessionStore,
	profile: ProfileRow,
	roots: Map<number, Uint8Array>,
) => {
	const { keyId } = readEnvelopeHeader(profile.indexKey);
	const root = roots.get(keyId);
	if (!root) {
		throw new EnvelopeError(
			`Profile has no key ${keyId} for its index key.`,
		);
	}
	const keys = await deriveContentKeys(root, keyId);
	const indexKey = await openBytes(
		keys.content,
		indexKeyLocation(profile.id),
		profile.indexKey,
	);
	await session.set({
		profileId: profile.id,
		currentKeyId: profile.currentKeyId,
		rootKeys: Object.fromEntries(
			[...roots].map(([id, bytes]) => [String(id), toBase64(bytes)]),
		),
		indexKey: toBase64(indexKey),
	});
};

// A new profile's row with fresh root and index keys, not yet stored. A
// null password makes a profile that is not encrypted at rest. The raw keys
// come back for callers that write records before the profile is stored,
// such as an import.
export const newProfile = async (
	input: { name: string; password: string | null; now: number },
	options: KeyOptions = {},
): Promise<{ row: ProfileRow; root: Uint8Array; indexKey: Uint8Array }> => {
	assertNewPassword(input.password);
	const id = crypto.randomUUID();
	const root = randomKeyBytes();
	const indexKey = randomKeyBytes();
	const keys = await deriveContentKeys(root, FIRST_KEY_ID);
	const row: ProfileRow = {
		id,
		name: input.name,
		createdAt: input.now,
		protection: input.password === null ? "none" : "password",
		keys: [await protect(root, input.password, id, FIRST_KEY_ID, options)],
		currentKeyId: FIRST_KEY_ID,
		indexKey: await sealBytes(
			keys.content,
			FIRST_KEY_ID,
			indexKeyLocation(id),
			indexKey,
		),
		prefs: DEFAULT_PREFS,
	};
	return { row, root, indexKey };
};

// Creates a profile and unlocks it.
export const createProfile = async (
	db: LittleDB,
	session: SessionStore,
	input: { name: string; password: string | null; now: number },
	options: KeyOptions = {},
): Promise<string> => {
	const { row, root } = await newProfile(input, options);
	await db.profiles.add(row);
	await startSession(session, row, new Map([[FIRST_KEY_ID, root]]));
	return row.id;
};

// One profile is unlocked at a time: unlocking replaces any other session.
export const unlockProfile = async (
	db: LittleDB,
	session: SessionStore,
	profileId: string,
	password: string | null,
): Promise<void> => {
	const profile = await getProfile(db, profileId);
	await startSession(session, profile, await readRootKeys(profile, password));
};

export const lockProfile = (session: SessionStore): Promise<void> =>
	session.clear();

// Re-wraps the root keys; no record changes. A null new password removes
// protection.
export const changePassword = async (
	db: LittleDB,
	profileId: string,
	oldPassword: string | null,
	newPassword: string | null,
	options: KeyOptions = {},
): Promise<void> => {
	assertNewPassword(newPassword);
	const profile = await getProfile(db, profileId);
	const roots = await readRootKeys(profile, oldPassword);
	const keys: Array<ProfileKeyEntry> = [];
	for (const [keyId, root] of roots) {
		keys.push(await protect(root, newPassword, profileId, keyId, options));
	}
	await db.profiles.update(profileId, {
		keys,
		protection: newPassword === null ? "none" : "password",
	});
};

// Needs the password of a protected profile (decision 0007, A14). Then
// crypto-shreds first: once the keys are gone the rows are unreadable, even
// if removing them is interrupted. A profile already without keys is such
// an interrupted delete, and finishing it needs no password.
export const deleteProfile = async (
	db: LittleDB,
	session: SessionStore,
	profileId: string,
	password: string | null,
): Promise<void> => {
	const profile = await db.profiles.get(profileId);
	if (profile && profile.keys.length > 0) {
		await readRootKeys(profile, password);
	}
	if ((await session.get())?.profileId === profileId) {
		await session.clear();
	}
	await db.profiles.update(profileId, { keys: [] });
	await removeProfileRows(db, profileId);
};

// Removes every row a profile owns, its own row last.
export const removeProfileRows = async (
	db: LittleDB,
	profileId: string,
): Promise<void> => {
	const owned = [profileId, Dexie.minKey] as const;
	const ownedEnd = [profileId, Dexie.maxKey] as const;
	await db.transaction(
		"rw",
		[
			db.saves,
			db.notes,
			db.tasks,
			db.reminders,
			db.assets,
			db.settings,
			db.links,
			db.avatars,
			db.profiles,
		],
		async () => {
			for (const table of [
				db.saves,
				db.notes,
				db.tasks,
				db.reminders,
				db.assets,
				db.settings,
			]) {
				await table
					.where("[profileId+keyId]")
					.between(owned, ownedEnd)
					.delete();
			}
			await db.links
				.where("[profileId+fromId]")
				.between(owned, ownedEnd)
				.delete();
			await db.avatars.delete(profileId);
			await db.profiles.delete(profileId);
		},
	);
};

export const PROFILE_THEMES = ["system", "light", "dark"] as const;
export type ProfileTheme = (typeof PROFILE_THEMES)[number];

// Plain profile fields the lock screen and the locked worker read (0010).
export const updateProfile = async (
	db: LittleDB,
	profileId: string,
	changes: { name?: string; theme?: ProfileTheme; autoLockMinutes?: number },
): Promise<void> => {
	await db.transaction("rw", db.profiles, async () => {
		const profile = await getProfile(db, profileId);
		await db.profiles.put({
			...profile,
			name: changes.name ?? profile.name,
			prefs: {
				theme: changes.theme ?? profile.prefs.theme,
				autoLockMinutes:
					changes.autoLockMinutes ?? profile.prefs.autoLockMinutes,
			},
		});
	});
};

// The avatar stays plain: the lock screen shows it (0010). Null removes it.
export const setAvatar = async (
	db: LittleDB,
	profileId: string,
	image: Blob | null,
): Promise<void> => {
	await getProfile(db, profileId);
	if (image === null) {
		await db.avatars.delete(profileId);
	} else {
		await db.avatars.put({ profileId, image });
	}
};
