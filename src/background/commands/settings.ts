import { LAI_PROVIDERS } from "little-shared/enums";
import {
	LMAX_VBM_LIMIT,
	LMAX_VBM_SAME_ORIGIN_LIMIT,
	LMIN_VBM_LIMIT,
	LMIN_VBM_SAME_ORIGIN_LIMIT,
} from "little-shared/constants";
import { sealBody } from "../../storage/keys";
import { getSettings, type Settings } from "../../storage/repositories";
import { asRecord, asString, defineCommand, fail } from "./registry";

const MAX_URL_LENGTH = 2_048;
const MAX_KEY_LENGTH = 4_096;
const MAX_MODEL_LENGTH = 256;

const bounded = (value: unknown, field: string, max: number): string => {
	const text = asString(value, field);
	return text.length <= max
		? text
		: fail(`${field} must be at most ${max} characters.`);
};

const asIntIn = (
	value: unknown,
	field: string,
	min: number,
	max: number,
): number =>
	Number.isInteger(value) &&
	(value as number) >= min &&
	(value as number) <= max
		? (value as number)
		: fail(`${field} must be a whole number from ${min} to ${max}.`);

const asProvider = (value: unknown): LAI_PROVIDERS =>
	Object.values(LAI_PROVIDERS).includes(value as LAI_PROVIDERS)
		? (value as LAI_PROVIDERS)
		: fail(
				`provider must be one of ${Object.values(LAI_PROVIDERS).join(", ")}.`,
			);

// The history limits; backups carry them too.
export const asMisc = (value: unknown): Settings["misc"] => {
	const misc = asRecord(value);
	return {
		VBMLimit: asIntIn(
			misc.VBMLimit,
			"VBMLimit",
			LMIN_VBM_LIMIT,
			LMAX_VBM_LIMIT,
		),
		VBMSameOriginLimit: asIntIn(
			misc.VBMSameOriginLimit,
			"VBMSameOriginLimit",
			LMIN_VBM_SAME_ORIGIN_LIMIT,
			LMAX_VBM_SAME_ORIGIN_LIMIT,
		),
	};
};

// Replaces the AI settings or the history limits of the unlocked profile.
// The row is sealed: it holds the AI provider's key (0010).
export const settingsUpdate = defineCommand({
	name: "settings.update",
	parse: (input) => {
		const record = asRecord(input);
		const ai =
			record.ai === undefined
				? undefined
				: (() => {
						const ai = asRecord(record.ai);
						return {
							provider: asProvider(ai.provider),
							baseUrl: bounded(
								ai.baseUrl,
								"baseUrl",
								MAX_URL_LENGTH,
							),
							apiKey: bounded(
								ai.apiKey,
								"apiKey",
								MAX_KEY_LENGTH,
							),
							model: bounded(ai.model, "model", MAX_MODEL_LENGTH),
						};
					})();
		const misc =
			record.misc === undefined ? undefined : asMisc(record.misc);
		return { ai, misc };
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const current = await getSettings(ctx.db, keys);
		const next: Settings = {
			ai: input.ai ?? current.ai,
			misc: input.misc ?? current.misc,
		};
		const now = ctx.now();
		const sealed = await sealBody<Settings>(
			keys,
			"settings",
			keys.profileId,
			next,
		);
		await ctx.db.transaction("rw", ctx.db.settings, async () => {
			const row = await ctx.db.settings.get(keys.profileId);
			await ctx.db.settings.put({
				id: keys.profileId,
				profileId: keys.profileId,
				...sealed,
				createdAt: row?.createdAt ?? now,
				updatedAt: now,
			});
		});
		return null;
	},
});
