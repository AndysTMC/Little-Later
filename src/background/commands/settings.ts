import { LAI_PROVIDERS, LHOME_MAIN_CONTENT } from "little-shared/enums";
import {
	LMAX_VBM_LIMIT,
	LMAX_VBM_SAME_ORIGIN_LIMIT,
	LMIN_VBM_LIMIT,
	LMIN_VBM_SAME_ORIGIN_LIMIT,
} from "little-shared/constants";
import type {
	LExternalMcpMode,
	LAIMemory,
	LAIPreset,
	LAIVerbosity,
} from "little-shared/types";
import { sealBody } from "../../storage/keys";
import { getSettings, type Settings } from "../../storage/repositories";
import { normalizeIgnoredDomains } from "../../utils/ignoredUrls";
import { asRecord, asString, defineCommand, fail } from "./registry";

const MAX_URL_LENGTH = 2_048;
const MAX_KEY_LENGTH = 4_096;
const MAX_MODEL_LENGTH = 256;
const MAX_INSTRUCTIONS_LENGTH = 1_000;
const MAX_PRESETS = 12;
const MAX_MEMORIES = 50;
const MAX_MEMORY_LENGTH = 280;

const VERBOSITIES: ReadonlyArray<LAIVerbosity> = [
	"concise",
	"balanced",
	"detailed",
];
const MCP_MODES: ReadonlyArray<LExternalMcpMode> = ["off", "read", "write"];
const HOME_TABS = new Set<string>(Object.values(LHOME_MAIN_CONTENT));
const BACKUP_REMINDER_OPTIONS = new Set([0, 14, 30]);
const CHAT_RETENTION_OPTIONS = new Set([0, 7, 30, -1]);

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

const optionalVerbosity = (value: unknown): LAIVerbosity | undefined => {
	if (value === undefined) return undefined;
	return VERBOSITIES.includes(value as LAIVerbosity)
		? (value as LAIVerbosity)
		: fail("verbosity must be concise, balanced, or detailed.");
};

const optionalLoopbackUrl = (value: unknown): string | undefined => {
	if (value === undefined) return undefined;
	const trimmed = bounded(value, "mcpServerUrl", MAX_URL_LENGTH).trim();
	if (trimmed === "") return "";
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return fail("MCP server URL must be a valid local URL.");
	}
	const isLocal =
		parsed.hostname === "127.0.0.1" ||
		parsed.hostname === "localhost" ||
		parsed.hostname === "[::1]";
	if (
		!isLocal ||
		(parsed.protocol !== "http:" && parsed.protocol !== "https:")
	) {
		return fail(
			"Local MCP server URL must use http or https on localhost or 127.0.0.1.",
		);
	}
	return trimmed;
};

const optionalPresets = (value: unknown): Array<LAIPreset> | undefined => {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.length > MAX_PRESETS) {
		return fail(`presets must be a list of at most ${MAX_PRESETS} items.`);
	}
	return value.map((entry) => {
		const item = asRecord(entry);
		return {
			id: bounded(item.id, "preset.id", 80),
			name: bounded(item.name, "preset.name", 60).trim() || "Preset",
			provider: asProvider(item.provider),
			baseUrl: bounded(item.baseUrl, "preset.baseUrl", MAX_URL_LENGTH),
			apiKey: bounded(item.apiKey, "preset.apiKey", MAX_KEY_LENGTH),
			model: bounded(item.model, "preset.model", MAX_MODEL_LENGTH),
		};
	});
};

const optionalMemories = (value: unknown): Array<LAIMemory> | undefined => {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.length > MAX_MEMORIES) {
		return fail(`memories must be at most ${MAX_MEMORIES} entries.`);
	}
	return value.map((entry) => {
		const item = asRecord(entry);
		const createdAt = item.createdAt;
		if (!Number.isSafeInteger(createdAt) || (createdAt as number) <= 0) {
			fail("memory.createdAt must be a positive timestamp.");
		}
		return {
			id: bounded(item.id, "memory.id", 80),
			text: bounded(item.text, "memory.text", MAX_MEMORY_LENGTH).trim(),
			createdAt: createdAt as number,
		};
	});
};

// The history limits and misc preferences; backups carry them too. Optional
// fields stay omitted when at their defaults to preserve backward compatibility.
export const asMisc = (value: unknown): Settings["misc"] => {
	const misc = asRecord(value);
	const base: Settings["misc"] = {
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
	if (
		typeof misc.defaultHomeTab === "string" &&
		HOME_TABS.has(misc.defaultHomeTab) &&
		misc.defaultHomeTab !== LHOME_MAIN_CONTENT.SAVES
	) {
		base.defaultHomeTab = misc.defaultHomeTab as LHOME_MAIN_CONTENT;
	}
	if (Array.isArray(misc.ignoredDomains)) {
		const normalized = normalizeIgnoredDomains(
			misc.ignoredDomains.filter(
				(entry): entry is string => typeof entry === "string",
			),
		);
		if (normalized.length > 0) {
			base.ignoredDomains = normalized;
		}
	}
	if (
		typeof misc.backupReminderDays === "number" &&
		BACKUP_REMINDER_OPTIONS.has(misc.backupReminderDays) &&
		misc.backupReminderDays > 0
	) {
		base.backupReminderDays = misc.backupReminderDays;
	}
	if (
		typeof misc.lastBackupAt === "number" &&
		Number.isSafeInteger(misc.lastBackupAt) &&
		misc.lastBackupAt > 0
	) {
		base.lastBackupAt = misc.lastBackupAt;
	}
	if (
		typeof misc.chatRetentionDays === "number" &&
		CHAT_RETENTION_OPTIONS.has(misc.chatRetentionDays) &&
		misc.chatRetentionDays !== 0
	) {
		base.chatRetentionDays = misc.chatRetentionDays;
	}
	if (
		typeof misc.externalMcpMode === "string" &&
		MCP_MODES.includes(misc.externalMcpMode as LExternalMcpMode) &&
		misc.externalMcpMode !== "off"
	) {
		base.externalMcpMode = misc.externalMcpMode as LExternalMcpMode;
	}
	if (misc.externalMcpAllowHistory === true) {
		base.externalMcpAllowHistory = true;
	}
	if (misc.externalMcpAllowDelete === true) {
		base.externalMcpAllowDelete = true;
	}
	return base;
};

// Replaces the AI settings or the history limits of the unlocked profile.
// The row is sealed: it holds the AI provider's key (0010).
export const settingsUpdate = defineCommand({
	name: "settings.update",
	parse: (input) => {
		const record = asRecord(input);
		const ai: Settings["ai"] | undefined =
			record.ai === undefined
				? undefined
				: (() => {
						const ai = asRecord(record.ai);
						const instructions =
							ai.instructions === undefined
								? undefined
								: bounded(
										ai.instructions,
										"instructions",
										MAX_INSTRUCTIONS_LENGTH,
									);
						const parsed: Settings["ai"] = {
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
						if (instructions !== undefined) {
							parsed.instructions = instructions;
						}
						const verbosity = optionalVerbosity(ai.verbosity);
						if (verbosity !== undefined) {
							parsed.verbosity = verbosity;
						}
						const presets = optionalPresets(ai.presets);
						if (presets !== undefined) {
							parsed.presets = presets;
						}
						const memories = optionalMemories(ai.memories);
						if (memories !== undefined) {
							parsed.memories = memories;
						}
						const mcpServerUrl = optionalLoopbackUrl(
							ai.mcpServerUrl,
						);
						if (mcpServerUrl !== undefined) {
							parsed.mcpServerUrl = mcpServerUrl;
						}
						return parsed;
					})();
		const misc =
			record.misc === undefined ? undefined : asMisc(record.misc);
		return { ai, misc };
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const current = await getSettings(ctx.db, keys);
		const nextAI: Settings["ai"] = input.ai
			? (() => {
					const merged: Settings["ai"] = {
						provider: input.ai.provider,
						baseUrl: input.ai.baseUrl,
						apiKey: input.ai.apiKey,
						model: input.ai.model,
					};
					const instructions =
						input.ai.instructions !== undefined
							? input.ai.instructions.trim()
							: (current.ai.instructions ?? "");
					if (instructions !== "") merged.instructions = instructions;
					const verbosity =
						input.ai.verbosity ?? current.ai.verbosity;
					if (verbosity && verbosity !== "balanced") {
						merged.verbosity = verbosity;
					}
					const presets = input.ai.presets ?? current.ai.presets;
					if (presets && presets.length > 0) merged.presets = presets;
					const memories = input.ai.memories ?? current.ai.memories;
					if (memories && memories.length > 0) {
						merged.memories = memories;
					}
					const mcpServerUrl =
						input.ai.mcpServerUrl !== undefined
							? input.ai.mcpServerUrl
							: (current.ai.mcpServerUrl ?? "");
					if (mcpServerUrl !== "") merged.mcpServerUrl = mcpServerUrl;
					return merged;
				})()
			: current.ai;
		const next: Settings = {
			ai: nextAI,
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
