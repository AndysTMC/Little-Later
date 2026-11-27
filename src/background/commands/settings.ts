import { LAI_PROVIDERS, LHOME_MAIN_CONTENT } from "little-shared/enums";
import {
	LMAX_VBM_LIMIT,
	LMAX_VBM_SAME_ORIGIN_LIMIT,
	LMIN_VBM_LIMIT,
	LMIN_VBM_SAME_ORIGIN_LIMIT,
} from "little-shared/constants";
import type {
	LExternalMcpMode,
	LAIMcpServer,
	LAIMemory,
	LAIPreset,
	LAIVerbosity,
} from "little-shared/types";
import { sealBody } from "../../storage/keys";
import { getSettings, type Settings } from "../../storage/repositories";
import { normalizeIgnoredDomains } from "../../utils/ignoredUrls";
import { asBoolean, asRecord, asString, defineCommand, fail } from "./registry";

const MAX_URL_LENGTH = 2_048;
const MAX_KEY_LENGTH = 4_096;
const MAX_MODEL_LENGTH = 256;
const MAX_INSTRUCTIONS_LENGTH = 1_000;
const MAX_PRESETS = 12;
const MAX_MEMORIES = 50;
const MAX_MEMORY_LENGTH = 280;
const MAX_MCP_SERVERS = 10;

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

const optionalLoopbackUrl = (
	value: unknown,
	field = "mcpServerUrl",
): string | undefined => {
	if (value === undefined) return undefined;
	const trimmed = bounded(value, field, MAX_URL_LENGTH).trim();
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

const optionalMcpServers = (
	value: unknown,
): Array<LAIMcpServer> | undefined => {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.length > MAX_MCP_SERVERS) {
		return fail(
			`mcpServers must be a list of at most ${MAX_MCP_SERVERS} servers.`,
		);
	}
	return value.map((entry) => {
		const item = asRecord(entry);
		const url = optionalLoopbackUrl(item.url, "mcpServer.url") ?? "";
		if (url === "") {
			fail("Each MCP server must include a local URL.");
		}
		return {
			id: bounded(item.id, "mcpServer.id", 80),
			name:
				bounded(item.name, "mcpServer.name", 60).trim() || "Local MCP",
			url,
			enabled: asBoolean(item.enabled, "mcpServer.enabled"),
		};
	});
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
	return base;
};

type McpServerOp =
	| { op: "add"; server: LAIMcpServer }
	| { op: "setEnabled"; id: string; enabled: boolean }
	| { op: "remove"; id: string };

type MemoryOp = { op: "add"; entry: LAIMemory } | { op: "remove"; id: string };

const optionalMcpServerOp = (value: unknown): McpServerOp | undefined => {
	if (value === undefined) return undefined;
	const rec = asRecord(value);
	const op = asString(rec.op, "mcpServerOp.op");
	if (op === "add") {
		const parsed = optionalMcpServers([rec.server]);
		if (!parsed || parsed.length !== 1) {
			return fail("mcpServerOp.server is invalid.");
		}
		return { op: "add", server: parsed[0]! };
	}
	if (op === "setEnabled") {
		const id = bounded(rec.id, "mcpServerOp.id", 64).trim();
		if (id === "") return fail("mcpServerOp.id is required.");
		if (typeof rec.enabled !== "boolean") {
			return fail("mcpServerOp.enabled must be a boolean.");
		}
		return { op: "setEnabled", id, enabled: rec.enabled };
	}
	if (op === "remove") {
		const id = bounded(rec.id, "mcpServerOp.id", 64).trim();
		if (id === "") return fail("mcpServerOp.id is required.");
		return { op: "remove", id };
	}
	return fail("Unsupported mcpServerOp.");
};

const optionalMemoryOp = (value: unknown): MemoryOp | undefined => {
	if (value === undefined) return undefined;
	const rec = asRecord(value);
	const op = asString(rec.op, "memoryOp.op");
	if (op === "add") {
		const parsed = optionalMemories([rec.entry]);
		if (!parsed || parsed.length !== 1) {
			return fail("memoryOp.entry is invalid.");
		}
		return { op: "add", entry: parsed[0]! };
	}
	if (op === "remove") {
		const id = bounded(rec.id, "memoryOp.id", 64).trim();
		if (id === "") return fail("memoryOp.id is required.");
		return { op: "remove", id };
	}
	return fail("Unsupported memoryOp.");
};

type AIPatch = Partial<Settings["ai"]> & {
	mcpServerOp?: McpServerOp;
	memoryOp?: MemoryOp;
};

// Updates the AI settings (full or section-scoped partial patch) or history
// limits of the unlocked profile inside the serialized write queue.
// The row is sealed: it holds the AI provider's key (0010).
export const settingsUpdate = defineCommand({
	name: "settings.update",
	parse: (input) => {
		const record = asRecord(input);
		const ai: AIPatch | undefined =
			record.ai === undefined
				? undefined
				: (() => {
						const ai = asRecord(record.ai);
						const parsed: AIPatch = {};
						if (ai.provider !== undefined) {
							parsed.provider = asProvider(ai.provider);
						}
						if (ai.baseUrl !== undefined) {
							parsed.baseUrl = bounded(
								ai.baseUrl,
								"baseUrl",
								MAX_URL_LENGTH,
							);
						}
						if (ai.apiKey !== undefined) {
							parsed.apiKey = bounded(
								ai.apiKey,
								"apiKey",
								MAX_KEY_LENGTH,
							);
						}
						if (ai.model !== undefined) {
							parsed.model = bounded(
								ai.model,
								"model",
								MAX_MODEL_LENGTH,
							);
						}
						if (ai.instructions !== undefined) {
							parsed.instructions = bounded(
								ai.instructions,
								"instructions",
								MAX_INSTRUCTIONS_LENGTH,
							);
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
						const mcpServers = optionalMcpServers(ai.mcpServers);
						if (mcpServers !== undefined) {
							parsed.mcpServers = mcpServers;
						}
						const mcpServerOp = optionalMcpServerOp(ai.mcpServerOp);
						if (mcpServerOp !== undefined) {
							parsed.mcpServerOp = mcpServerOp;
						}
						const memoryOp = optionalMemoryOp(ai.memoryOp);
						if (memoryOp !== undefined) {
							parsed.memoryOp = memoryOp;
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
						provider: input.ai.provider ?? current.ai.provider,
						baseUrl: input.ai.baseUrl ?? current.ai.baseUrl,
						apiKey: input.ai.apiKey ?? current.ai.apiKey,
						model: input.ai.model ?? current.ai.model,
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

					let memories = input.ai.memories ?? current.ai.memories;
					if (input.ai.memoryOp) {
						const op = input.ai.memoryOp;
						const baseMemories = [...(memories ?? [])];
						if (op.op === "add") {
							const normalizedText = op.entry.text.toLowerCase();
							if (
								!baseMemories.some(
									(item) =>
										item.id === op.entry.id ||
										item.text.toLowerCase() ===
											normalizedText,
								)
							) {
								baseMemories.push(op.entry);
							}
							memories = baseMemories.slice(-MAX_MEMORIES);
						} else if (op.op === "remove") {
							memories = baseMemories.filter(
								(item) => item.id !== op.id,
							);
						}
					}
					if (memories && memories.length > 0) {
						merged.memories = memories;
					}

					let mcpServerUrl =
						input.ai.mcpServerUrl !== undefined
							? input.ai.mcpServerUrl
							: (current.ai.mcpServerUrl ?? "");
					let mcpServers =
						input.ai.mcpServers !== undefined
							? input.ai.mcpServers
							: current.ai.mcpServers;

					if (input.ai.mcpServerOp) {
						const op = input.ai.mcpServerOp;
						const baseServers: Array<LAIMcpServer> = Array.isArray(
							mcpServers,
						)
							? [...mcpServers]
							: mcpServerUrl !== ""
								? [
										{
											id: "legacy-local-mcp",
											name: "Local MCP",
											url: mcpServerUrl,
											enabled: true,
										},
									]
								: [];
						mcpServerUrl = "";
						if (op.op === "add") {
							if (
								baseServers.length < MAX_MCP_SERVERS &&
								!baseServers.some(
									(item) => item.id === op.server.id,
								)
							) {
								baseServers.push(op.server);
							}
							mcpServers = baseServers;
						} else if (op.op === "setEnabled") {
							mcpServers = baseServers.map((item) =>
								item.id === op.id
									? { ...item, enabled: op.enabled }
									: item,
							);
						} else if (op.op === "remove") {
							mcpServers = baseServers.filter(
								(item) => item.id !== op.id,
							);
						}
					}

					if (mcpServerUrl !== "") merged.mcpServerUrl = mcpServerUrl;
					if (mcpServers && mcpServers.length > 0) {
						merged.mcpServers = mcpServers;
					}
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
