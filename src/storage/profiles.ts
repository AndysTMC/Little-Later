import type { Accent } from "../appearance";
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
import {
	authenticatorSeals,
	newRecoveryCode,
	newSalt,
	newSecondKey,
	openSecondKey,
	openWithFactor,
	recoverySeals,
	sealSecondKey,
	type Factor,
	type SecondFactor,
} from "./secondFactor";
import { fromBase64, toBase64, type SessionStore } from "./session";

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

// A profile whose keys were shredded by an interrupted delete has nothing
// to unlock and nothing a password could verify.
const hasKeys = (profile: ProfileRow) =>
	profile.keys.length > 0 || profile.secondFactor !== undefined;

export const NEEDS_SECOND_FACTOR =
	"This profile also needs its security key or recovery code.";

const readRootKeys = async (
	profile: ProfileRow,
	password: string | null,
	factor?: Factor,
): Promise<Map<number, Uint8Array>> => {
	if (!hasKeys(profile)) {
		throw new ProfileError("This profile has no keys.");
	}
	if (profile.protection === "password" && password === null) {
		throw new ProfileError("This profile needs its password.");
	}
	if (profile.secondFactor) {
		const secondKey = await openSecondKey(
			profile.secondFactor,
			password ?? "",
			profile.id,
		);
		if (!factor) {
			throw new ProfileError(NEEDS_SECOND_FACTOR);
		}
		return openWithFactor(
			profile.secondFactor,
			secondKey,
			factor,
			profile.id,
		);
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
		unlockId: crypto.randomUUID(),
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
	factor?: Factor,
): Promise<void> => {
	const profile = await getProfile(db, profileId);
	await startSession(
		session,
		profile,
		await readRootKeys(profile, password, factor),
	);
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
	// With two-factor unlock on, the password wraps only W: re-wrapping it
	// keeps every factor working, and needs no factor.
	if (profile.secondFactor) {
		if (newPassword === null) {
			throw new ProfileError(
				"Turn off two-factor unlock before removing the password.",
			);
		}
		const secondKey = await openSecondKey(
			profile.secondFactor,
			oldPassword ?? "",
			profileId,
		);
		await db.profiles.update(profileId, {
			secondFactor: {
				...profile.secondFactor,
				passwordKey: await sealSecondKey(
					secondKey,
					newPassword,
					profileId,
					(options.kdf ?? newKdfParams)(),
				),
			},
		});
		return;
	}
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
	if (profile?.secondFactor) {
		// The password alone: someone who lost every factor can still
		// remove the profile, which reveals nothing.
		await openSecondKey(profile.secondFactor, password ?? "", profileId);
	} else if (profile && hasKeys(profile)) {
		await readRootKeys(profile, password);
	}
	if ((await session.get())?.profileId === profileId) {
		await session.clear();
	}
	await db.profiles.update(profileId, { keys: [], secondFactor: undefined });
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
	changes: {
		name?: string;
		theme?: ProfileTheme;
		autoLockMinutes?: number;
		accent?: Accent;
		accentColor?: string;
	},
): Promise<void> => {
	await db.transaction("rw", db.profiles, async () => {
		const profile = await getProfile(db, profileId);
		await db.profiles.put({
			...profile,
			name: changes.name ?? profile.name,
			prefs: {
				...profile.prefs,
				theme: changes.theme ?? profile.prefs.theme,
				autoLockMinutes:
					changes.autoLockMinutes ?? profile.prefs.autoLockMinutes,
				...(changes.accent ? { accent: changes.accent } : {}),
				...(changes.accentColor
					? { accentColor: changes.accentColor }
					: {}),
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

// Two-factor unlock (decision 0015, src/storage/secondFactor.ts). Every
// change needs the profile unlocked, whose root keys the session holds, and
// its password.

export type NewAuthenticator = {
	credentialId: Uint8Array;
	prfSalt: Uint8Array;
	// The authenticator's PRF output for prfSalt.
	secret: Uint8Array;
	name: string;
};

const sessionRoots = async (
	session: SessionStore,
	profileId: string,
): Promise<Map<number, Uint8Array>> => {
	const unlocked = await session.get();
	if (unlocked?.profileId !== profileId) {
		throw new ProfileError("Unlock this profile first.");
	}
	return new Map(
		Object.entries(unlocked.rootKeys).map(([keyId, root]) => [
			Number(keyId),
			fromBase64(root),
		]),
	);
};

const assertName = (name: string) => {
	if (name.trim() === "" || name.length > 40) {
		throw new ProfileError("Name the key in 1 to 40 characters.");
	}
};

// Adds an authenticator. The first one turns two-factor unlock on: the
// password-only wraps go, and a recovery code is made, returned once.
export const addAuthenticator = async (
	db: LittleDB,
	session: SessionStore,
	profileId: string,
	password: string,
	authenticator: NewAuthenticator,
	now: number,
	options: KeyOptions = {},
): Promise<{ recoveryCode: string | null }> => {
	assertName(authenticator.name);
	const profile = await getProfile(db, profileId);
	if (profile.protection !== "password") {
		throw new ProfileError("Set a password first.");
	}
	const roots = await sessionRoots(session, profileId);
	const entry = async (secondKey: Uint8Array) => ({
		credentialId: authenticator.credentialId,
		name: authenticator.name.trim(),
		addedAt: now,
		prfSalt: authenticator.prfSalt,
		keys: await authenticatorSeals(
			roots,
			secondKey,
			authenticator.credentialId,
			authenticator.prfSalt,
			authenticator.secret,
			profileId,
		),
	});
	if (profile.secondFactor) {
		const secondKey = await openSecondKey(
			profile.secondFactor,
			password,
			profileId,
		);
		await db.profiles.update(profileId, {
			secondFactor: {
				...profile.secondFactor,
				authenticators: [
					...profile.secondFactor.authenticators,
					await entry(secondKey),
				],
			},
		});
		return { recoveryCode: null };
	}
	// Checks the password against the wraps it is about to replace.
	await readRootKeys(profile, password);
	const secondKey = newSecondKey();
	const recoveryCode = newRecoveryCode();
	const salt = newSalt();
	const secondFactor: SecondFactor = {
		passwordKey: await sealSecondKey(
			secondKey,
			password,
			profileId,
			(options.kdf ?? newKdfParams)(),
		),
		authenticators: [await entry(secondKey)],
		recovery: {
			salt,
			keys: await recoverySeals(
				roots,
				secondKey,
				recoveryCode,
				salt,
				profileId,
			),
		},
	};
	await db.profiles.update(profileId, { keys: [], secondFactor });
	return { recoveryCode };
};

// Turns two-factor unlock off: the root keys go back under the password
// alone.
export const disableSecondFactor = async (
	db: LittleDB,
	session: SessionStore,
	profileId: string,
	password: string,
	options: KeyOptions = {},
): Promise<void> => {
	const profile = await getProfile(db, profileId);
	if (!profile.secondFactor) return;
	await openSecondKey(profile.secondFactor, password, profileId);
	const roots = await sessionRoots(session, profileId);
	const keys: Array<ProfileKeyEntry> = [];
	for (const [keyId, root] of roots) {
		keys.push(await protect(root, password, profileId, keyId, options));
	}
	await db.profiles.update(profileId, { keys, secondFactor: undefined });
};

// Removes one authenticator; removing the last turns two-factor unlock off.
export const removeAuthenticator = async (
	db: LittleDB,
	session: SessionStore,
	profileId: string,
	password: string,
	credentialId: Uint8Array,
	options: KeyOptions = {},
): Promise<void> => {
	const profile = await getProfile(db, profileId);
	if (!profile.secondFactor) return;
	await openSecondKey(profile.secondFactor, password, profileId);
	const left = profile.secondFactor.authenticators.filter(
		(entry) => toBase64(entry.credentialId) !== toBase64(credentialId),
	);
	if (left.length === 0) {
		await disableSecondFactor(db, session, profileId, password, options);
		return;
	}
	await sessionRoots(session, profileId);
	await db.profiles.update(profileId, {
		secondFactor: { ...profile.secondFactor, authenticators: left },
	});
};

// Replaces the recovery code; the old one stops working. Returned once.
export const replaceRecoveryCode = async (
	db: LittleDB,
	session: SessionStore,
	profileId: string,
	password: string,
): Promise<string> => {
	const profile = await getProfile(db, profileId);
	if (!profile.secondFactor) {
		throw new ProfileError("Two-factor unlock is off.");
	}
	const secondKey = await openSecondKey(
		profile.secondFactor,
		password,
		profileId,
	);
	const roots = await sessionRoots(session, profileId);
	const recoveryCode = newRecoveryCode();
	const salt = newSalt();
	await db.profiles.update(profileId, {
		secondFactor: {
			...profile.secondFactor,
			recovery: {
				salt,
				keys: await recoverySeals(
					roots,
					secondKey,
					recoveryCode,
					salt,
					profileId,
				),
			},
		},
	});
	return recoveryCode;
};
