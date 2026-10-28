import {
	PROFILE_THEMES,
	changePassword,
	createProfile,
	deleteProfile,
	lockProfile,
	setAvatar,
	unlockProfile,
	updateProfile,
	type ProfileTheme,
} from "../../storage/profiles";
import { LMAX_NAME_LENGTH } from "little-shared/constants";
import {
	CommandError,
	asNullableString,
	asRecord,
	asString,
	defineCommand,
	fail,
} from "./registry";

const MAX_AUTO_LOCK_MINUTES = 24 * 60;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const asProfileName = (value: unknown): string => {
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
		};
	},
	run: async (ctx, input) => {
		await unlockProfile(
			ctx.db,
			ctx.session,
			input.profileId,
			input.password,
		);
		return null;
	},
});

export const profileLock = defineCommand({
	name: "profile.lock",
	parse: () => null,
	run: async (ctx) => {
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
		const { theme, autoLockMinutes } = record;
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
