import {
	changePassword,
	createProfile,
	deleteProfile,
	lockProfile,
	unlockProfile,
} from "../../storage/profiles";
import {
	asNullableString,
	asRecord,
	asString,
	defineCommand,
	fail,
} from "./registry";

const MAX_NAME_LENGTH = 64;

const asProfileName = (value: unknown): string => {
	const name = asString(value, "name").trim();
	return name.length > 0 && name.length <= MAX_NAME_LENGTH
		? name
		: fail(`name must be 1 to ${MAX_NAME_LENGTH} characters.`);
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
