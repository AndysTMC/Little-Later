import { ACCENTS, isAccent, isAccentColor } from "../../appearance";
import {
	PROFILE_THEMES,
	addAuthenticator,
	changePassword,
	createProfile,
	deleteProfile,
	disableSecondFactor,
	lockProfile,
	removeAuthenticator,
	replaceRecoveryCode,
	setAvatar,
	unlockProfile,
	updateProfile,
	verifyPassword,
	type ProfileTheme,
} from "../../storage/profiles";
import type { Factor } from "../../storage/secondFactor";
import { fromBase64 } from "../../storage/session";
import { LMAX_NAME_LENGTH } from "little-shared/constants";
import { STAGED_FILE_MAX_AGE } from "../../storage/staging";
import { enforceChatRetention } from "../chatRetention";
import {
	CommandError,
	asNullableString,
	asRecord,
	asString,
	defineCommand,
	fail,
} from "./registry";

// Chrome's idle detection goes up to four hours and silently clamps a
// longer interval, so a longer setting would never be honoured.
export const MAX_AUTO_LOCK_MINUTES = 4 * 60;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
];

// Bytes travel as base64, since runtime messages are JSON; a command
// checks them on the way in and decodes them when it runs.
const asBase64 = (value: unknown, field: string, length?: number): string => {
	const text = asString(value, field);
	let bytes: Uint8Array;
	try {
		bytes = fromBase64(text);
	} catch {
		return fail(`${field} must be base64.`);
	}
	if (
		bytes.length === 0 ||
		(length !== undefined && bytes.length !== length)
	) {
		return fail(`${field} has the wrong length.`);
	}
	return text;
};

// The second factor that comes with a password (decision 0015): an
// authenticator's credential and PRF output, or the recovery code.
type FactorInput =
	| { kind: "authenticator"; credentialId: string; secret: string }
	| { kind: "recovery"; code: string };

const asFactor = (value: unknown): FactorInput | undefined => {
	if (value === undefined || value === null) return undefined;
	const record = asRecord(value);
	if (record.kind === "recovery") {
		return { kind: "recovery", code: asString(record.code, "code") };
	}
	if (record.kind === "authenticator") {
		return {
			kind: "authenticator",
			credentialId: asBase64(record.credentialId, "credentialId"),
			secret: asBase64(record.secret, "secret", 32),
		};
	}
	return fail("factor must be an authenticator or a recovery code.");
};

const toFactor = (input: FactorInput | undefined): Factor | undefined =>
	input?.kind === "authenticator"
		? {
				kind: "authenticator",
				credentialId: fromBase64(input.credentialId),
				secret: fromBase64(input.secret),
			}
		: input;

export const asProfileName = (value: unknown): string => {
	const name = asString(value, "name").trim();
	return name.length > 0 && name.length <= LMAX_NAME_LENGTH
		? name
		: fail(`name must be 1 to ${LMAX_NAME_LENGTH} characters.`);
};

export const profileCreate = defineCommand({
	name: "profile.create",
	parse: (input) => {
		const record = asRecord(input);
		return {
			name: asProfileName(record.name),
			password: asNullableString(record.password, "password"),
		};
	},
	run: async (ctx, input) => ({
		profileId: await createProfile(ctx.db, ctx.session, {
			...input,
			now: ctx.now(),
		}),
	}),
});

export const profileUnlock = defineCommand({
	name: "profile.unlock",
	parse: (input) => {
		const record = asRecord(input);
		return {
			profileId: asString(record.profileId, "profileId"),
			password: asNullableString(record.password, "password"),
			factor: asFactor(record.factor),
		};
	},
	run: async (ctx, input) => {
		await unlockProfile(
			ctx.db,
			ctx.session,
			input.profileId,
			input.password,
			toFactor(input.factor),
		);
		// A browser restart clears chrome.storage.session without firing
		// profile.lock; enforce "When profile locks" and age-based retention
		// immediately on unlock for chats left over from prior sessions.
		try {
			const keys = await ctx.keys();
			await enforceChatRetention(ctx.db, keys, {
				onLock: true,
				now: ctx.now(),
			});
		} catch {
			// Never block unlocking if chat retention cleanup fails.
		}
		// Unlock is the other moment 0012 sweeps leftovers (Messaging).
		await ctx.staging.sweep(
			ctx.now() - STAGED_FILE_MAX_AGE,
			await ctx.stagedInUse(),
		);
		return null;
	},
});

export const profileLock = defineCommand({
	name: "profile.lock",
	parse: () => null,
	run: async (ctx) => {
		try {
			const keys = await ctx.keys();
			await enforceChatRetention(ctx.db, keys, {
				onLock: true,
				now: ctx.now(),
			});
		} catch {
			// Already locked or unreadable: never block locking.
		}
		await lockProfile(ctx.session);
		return null;
	},
});

export const profileChangePassword = defineCommand({
	name: "profile.changePassword",
	parse: (input) => {
		const record = asRecord(input);
		return {
			profileId: asString(record.profileId, "profileId"),
			oldPassword: asNullableString(record.oldPassword, "oldPassword"),
			newPassword: asNullableString(record.newPassword, "newPassword"),
		};
	},
	run: async (ctx, input) => {
		await changePassword(
			ctx.db,
			input.profileId,
			input.oldPassword,
			input.newPassword,
		);
		return null;
	},
});

export const profileDelete = defineCommand({
	name: "profile.delete",
	parse: (input) => {
		const record = asRecord(input);
		return {
			profileId: asString(record.profileId, "profileId"),
			password: asNullableString(record.password, "password"),
		};
	},
	run: async (ctx, input) => {
		await deleteProfile(
			ctx.db,
			ctx.session,
			input.profileId,
			input.password,
		);
		return null;
	},
});

// Renames the unlocked profile or changes its plain preferences.
export const profileUpdate = defineCommand({
	name: "profile.update",
	parse: (input) => {
		const record = asRecord(input);
		const { theme, autoLockMinutes, accent, accentColor } = record;
		return {
			name:
				record.name === undefined
					? undefined
					: asProfileName(record.name),
			theme:
				theme === undefined
					? undefined
					: PROFILE_THEMES.includes(theme as ProfileTheme)
						? (theme as ProfileTheme)
						: fail("theme must be system, light or dark."),
			autoLockMinutes:
				autoLockMinutes === undefined
					? undefined
					: Number.isInteger(autoLockMinutes) &&
						  (autoLockMinutes as number) >= 1 &&
						  (autoLockMinutes as number) <= MAX_AUTO_LOCK_MINUTES
						? (autoLockMinutes as number)
						: fail(
								`autoLockMinutes must be a whole number from 1 to ${MAX_AUTO_LOCK_MINUTES}.`,
							),
			accent:
				accent === undefined
					? undefined
					: isAccent(accent)
						? accent
						: fail(
								`accent must be one of ${Object.keys(ACCENTS).join(", ")}.`,
							),
			accentColor:
				accentColor === undefined
					? undefined
					: isAccentColor(accentColor)
						? accentColor
						: fail("accentColor must be a colour such as #0e7490."),
		};
	},
	run: async (ctx, input) => {
		const { profileId } = await ctx.keys();
		await updateProfile(ctx.db, profileId, input);
		return null;
	},
});

// Sets the unlocked profile's avatar from a staged file, or removes it.
export const profileSetAvatar = defineCommand({
	name: "profile.setAvatar",
	parse: (input) => {
		const record = asRecord(input);
		if (record.file === null) {
			return { file: null };
		}
		const type = asString(record.type, "type");
		return {
			file: asString(record.file, "file"),
			type: AVATAR_TYPES.includes(type)
				? type
				: fail("type must be a PNG, JPEG, WebP or GIF image."),
		};
	},
	run: async (ctx, input) => {
		const { profileId } = await ctx.keys();
		if (input.file === null) {
			await setAvatar(ctx.db, profileId, null);
			return null;
		}
		const bytes = await ctx.staging.take(input.file);
		if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) {
			throw new CommandError(
				"rejected",
				"An avatar must be an image of at most 2 MB.",
			);
		}
		await setAvatar(
			ctx.db,
			profileId,
			new Blob([bytes], { type: input.type }),
		);
		return null;
	},
});

// Two-factor unlock (decision 0015). Each needs the unlocked profile's
// password; the WebAuthn ceremony itself runs in the page.

export const profileVerifyPassword = defineCommand({
	name: "profile.verifyPassword",
	parse: (input) => ({
		password: asString(asRecord(input).password, "password"),
	}),
	run: async (ctx, input) => {
		const { profileId } = await ctx.keys();
		await verifyPassword(ctx.db, profileId, input.password);
		return null;
	},
});

export const profileAddAuthenticator = defineCommand({
	name: "profile.addAuthenticator",
	parse: (input) => {
		const record = asRecord(input);
		return {
			password: asString(record.password, "password"),
			credentialId: asBase64(record.credentialId, "credentialId"),
			prfSalt: asBase64(record.prfSalt, "prfSalt", 32),
			secret: asBase64(record.secret, "secret", 32),
			name: asString(record.name, "name"),
		};
	},
	run: async (ctx, input) => {
		const { profileId } = await ctx.keys();
		return addAuthenticator(
			ctx.db,
			ctx.session,
			profileId,
			input.password,
			{
				credentialId: fromBase64(input.credentialId),
				prfSalt: fromBase64(input.prfSalt),
				secret: fromBase64(input.secret),
				name: input.name,
			},
			ctx.now(),
		);
	},
});

export const profileRemoveAuthenticator = defineCommand({
	name: "profile.removeAuthenticator",
	parse: (input) => {
		const record = asRecord(input);
		return {
			password: asString(record.password, "password"),
			credentialId: asBase64(record.credentialId, "credentialId"),
		};
	},
	run: async (ctx, input) => {
		const { profileId } = await ctx.keys();
		await removeAuthenticator(
			ctx.db,
			ctx.session,
			profileId,
			input.password,
			fromBase64(input.credentialId),
		);
		return null;
	},
});

export const profileDisableSecondFactor = defineCommand({
	name: "profile.disableSecondFactor",
	parse: (input) => ({
		password: asString(asRecord(input).password, "password"),
	}),
	run: async (ctx, input) => {
		const { profileId } = await ctx.keys();
		await disableSecondFactor(
			ctx.db,
			ctx.session,
			profileId,
			input.password,
		);
		return null;
	},
});

export const profileNewRecoveryCode = defineCommand({
	name: "profile.newRecoveryCode",
	parse: (input) => ({
		password: asString(asRecord(input).password, "password"),
	}),
	run: async (ctx, input) => {
		const { profileId } = await ctx.keys();
		return {
			recoveryCode: await replaceRecoveryCode(
				ctx.db,
				ctx.session,
				profileId,
				input.password,
			),
		};
	},
});
