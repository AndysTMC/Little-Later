import Dexie from "dexie";
import { LTASK_PRIORITY } from "little-shared/enums";
import type { LExternalMcpMode } from "little-shared/types";
import {
	parseRule,
	ScheduleError,
	type Frequency,
	type RecurrenceRule,
} from "little-shared/utils/schedule";
import { importProfileKeys, type ProfileKeys } from "../storage/keys";
import {
	getSettings,
	listImages,
	listReminders,
	listSaves,
	listTasks,
	openEach,
	openNote,
	openReminder,
	type ImageRecord,
	type Note,
	type Reminder,
	type Save,
	type Task,
} from "../storage/repositories";
import type { LittleDB, TaskSchedule } from "../storage/schema";
import type { SessionStore } from "../storage/session";
import { hybridRank } from "../services/ai/toolCalls/_utils/bm25";
import { normalizeTag } from "../utils/tags";
import type { Dispatch } from "./commands/registry";

export const EXTERNAL_MCP_HOST_NAME = "com.littlelater.mcp";

export type JsonRpcRequest = {
	jsonrpc?: string;
	id?: string | number | null;
	method?: string;
	params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
	jsonrpc: "2.0";
	id: string | number | null;
	result?: unknown;
	error?: { code: number; message: string };
};

type McpToolDef = {
	name: string;
	description: string;
	write?: boolean;
	inputSchema: Record<string, unknown>;
};

const RECURRENCE_SCHEMA = {
	type: "object",
	description:
		"Recurring schedule rule. Defaults: interval=1, time='09:00', anchor=today (YYYY-MM-DD), zone='floating'.",
	properties: {
		freq: {
			type: "string",
			enum: ["daily", "weekly", "monthly", "yearly"],
		},
		interval: {
			type: "integer",
			minimum: 1,
			description: "Repeat every N periods (default 1).",
		},
		time: {
			type: "string",
			description: 'Local wall-clock time "HH:mm" (default "09:00").',
		},
		byWeekday: {
			type: "array",
			items: { type: "integer", minimum: 1, maximum: 7 },
			description:
				"ISO weekdays 1 (Mon) .. 7 (Sun). For daily/weekly rules.",
		},
		byMonthDay: {
			type: "integer",
			description:
				"Day of month 1..31, or -1 for the last day of the month. For monthly/yearly rules.",
		},
		byMonth: {
			type: "integer",
			minimum: 1,
			maximum: 12,
			description: "Month 1..12. For yearly rules.",
		},
		anchor: {
			type: "string",
			description: 'Start date "YYYY-MM-DD" (defaults to today).',
		},
		zone: {
			type: "string",
			description: '"floating" (default) or an IANA time zone.',
		},
	},
	required: ["freq"],
};

const SCHEDULE_SCHEMA = {
	type: "object",
	description:
		"Task schedule: { kind: 'anytime' }, { kind: 'due', at: <epochMs|ISO> }, or { kind: 'recurring', rule: {...} }.",
	properties: {
		kind: { type: "string", enum: ["anytime", "due", "recurring"] },
		at: {
			oneOf: [{ type: "integer" }, { type: "string" }],
			description: "Due timestamp as epoch ms or ISO-8601 string.",
		},
		rule: RECURRENCE_SCHEMA,
	},
	required: ["kind"],
};

const MCP_TOOLS: ReadonlyArray<McpToolDef> = [
	// --- Read tools ---
	{
		name: "list_saves",
		description: "List saved visual bookmarks from the unlocked profile.",
		inputSchema: {
			type: "object",
			properties: {
				includeArchived: { type: "boolean" },
				includeSnapshot: { type: "boolean" },
				tag: { type: "string" },
				limit: { type: "integer" },
			},
		},
	},
	{
		name: "list_history",
		description:
			"List recently browsed (unsaved) web history from the unlocked profile.",
		inputSchema: {
			type: "object",
			properties: {
				limit: { type: "integer" },
			},
		},
	},
	{
		name: "list_tasks",
		description:
			"List tasks from the unlocked profile, optionally filtered by completion, priority, or tag.",
		inputSchema: {
			type: "object",
			properties: {
				includeFinished: { type: "boolean" },
				priority: { type: "string", enum: ["low", "medium", "high"] },
				tag: { type: "string" },
				limit: { type: "integer" },
			},
		},
	},
	{
		name: "list_reminders",
		description: "List reminders from the unlocked profile.",
		inputSchema: {
			type: "object",
			properties: {
				includeFired: { type: "boolean" },
				tag: { type: "string" },
				limit: { type: "integer" },
			},
		},
	},
	{
		name: "list_notes",
		description:
			"List unlocked notes from the unlocked profile (locked notes are never exposed).",
		inputSchema: {
			type: "object",
			properties: {
				tag: { type: "string" },
				limit: { type: "integer" },
			},
		},
	},
	{
		name: "get_note",
		description:
			"Read a single unlocked note by id (locked notes are never exposed).",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
			},
			required: ["id"],
		},
	},
	{
		name: "list_images",
		description: "List saved image metadata from the unlocked profile.",
		inputSchema: {
			type: "object",
			properties: {
				tag: { type: "string" },
				limit: { type: "integer" },
			},
		},
	},
	{
		name: "list_links",
		description:
			"List links connecting notes, tasks, and reminders to saves (or reminders to tasks).",
		inputSchema: {
			type: "object",
			properties: {
				recordId: {
					type: "string",
					description:
						"Optional record id to filter links where fromId or toId matches.",
				},
			},
		},
	},
	{
		name: "list_tags",
		description:
			"List all tags in use across unlocked saves, tasks, reminders, notes, and images with counts.",
		inputSchema: {
			type: "object",
			properties: {},
		},
	},
	{
		name: "search_all",
		description:
			"Search across unlocked notes, tasks, reminders, saves, and images.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string" },
				tag: { type: "string" },
				limit: { type: "integer" },
			},
			required: ["query"],
		},
	},
	{
		name: "get_productivity_overview",
		description:
			"Get a summary of open/overdue/completed tasks, upcoming reminders, saves, unlocked notes, and images.",
		inputSchema: {
			type: "object",
			properties: {},
		},
	},

	// --- Write tools (require External MCP mode = "write") ---
	{
		name: "create_save",
		description:
			"Save an http/https webpage bookmark with optional custom name, tags, and offline text snapshot.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string" },
				title: { type: "string" },
				customName: { type: "string" },
				tags: { type: "array", items: { type: "string" } },
				snapshot: { type: "string" },
			},
			required: ["url"],
		},
	},
	{
		name: "update_save",
		description:
			"Rename, archive/unarchive, retag, unsave, or update the offline snapshot of a saved page.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
				customName: { type: "string" },
				archived: { type: "boolean" },
				saved: { type: "boolean" },
				tags: { type: "array", items: { type: "string" } },
				snapshot: { type: ["string", "null"] },
			},
			required: ["id"],
		},
	},
	{
		name: "delete_save",
		description: "Delete a saved page by id.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
			},
			required: ["id"],
		},
	},
	{
		name: "create_note",
		description:
			"Create a new unlocked note, optionally attached to saved pages via saveIds.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				title: { type: "string" },
				content: { type: "string" },
				tags: { type: "array", items: { type: "string" } },
				saveIds: { type: "array", items: { type: "string" } },
			},
			required: ["content"],
		},
	},
	{
		name: "update_note",
		description:
			"Update an existing unlocked note's content, title, tags, or linked saveIds (locked notes are refused).",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
				content: { type: "string" },
				title: { type: "string" },
				tags: { type: "array", items: { type: "string" } },
				saveIds: { type: "array", items: { type: "string" } },
			},
			required: ["id", "content"],
		},
	},
	{
		name: "delete_note",
		description:
			"Delete an unlocked note by id (locked notes are refused).",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
			},
			required: ["id"],
		},
	},
	{
		name: "create_task",
		description:
			"Create a task with full schedule support: anytime (default), due (dueAt or schedule.kind='due' as epoch ms or ISO string), or recurring (recurrence or schedule.kind='recurring'), optional priority, reminder ('normal' or 'escalating'), tags, and linked saveIds.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				information: { type: "string" },
				label: { type: "string" },
				priority: { type: "string", enum: ["low", "medium", "high"] },
				dueAt: {
					oneOf: [{ type: "integer" }, { type: "string" }],
					description:
						"Shorthand due timestamp (epoch ms or ISO-8601 string).",
				},
				recurrence: RECURRENCE_SCHEMA,
				schedule: SCHEDULE_SCHEMA,
				reminder: {
					oneOf: [
						{
							type: "string",
							enum: ["normal", "escalating"],
						},
						{ type: "null" },
					],
					description:
						"Attach a task reminder ('normal' or 'escalating'); requires a due or recurring schedule.",
				},
				tags: { type: "array", items: { type: "string" } },
				saveIds: { type: "array", items: { type: "string" } },
			},
			required: ["information"],
		},
	},
	{
		name: "update_task",
		description:
			"Update any task field: information, label, priority, schedule/dueAt/recurrence, reminder ('normal' | 'escalating' | null), tags, or linked saveIds.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
				information: { type: "string" },
				label: { type: "string" },
				priority: { type: "string", enum: ["low", "medium", "high"] },
				dueAt: {
					oneOf: [
						{ type: "integer" },
						{ type: "string" },
						{ type: "null" },
					],
				},
				recurrence: RECURRENCE_SCHEMA,
				schedule: SCHEDULE_SCHEMA,
				reminder: {
					oneOf: [
						{
							type: "string",
							enum: ["normal", "escalating"],
						},
						{ type: "null" },
					],
				},
				tags: { type: "array", items: { type: "string" } },
				saveIds: { type: "array", items: { type: "string" } },
			},
			required: ["id"],
		},
	},
	{
		name: "complete_task",
		description:
			"Mark a task completed by id (recurring tasks advance to their next occurrence).",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
			},
			required: ["id"],
		},
	},
	{
		name: "reopen_task",
		description: "Reopen a completed non-recurring task by id.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
			},
			required: ["id"],
		},
	},
	{
		name: "delete_task",
		description: "Delete a task (and its attached task reminder) by id.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
			},
			required: ["id"],
		},
	},
	{
		name: "create_reminder",
		description:
			"Create a standalone reminder (target may be epoch ms or ISO-8601 timestamp).",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				message: { type: "string" },
				target: {
					oneOf: [{ type: "integer" }, { type: "string" }],
				},
				escalate: { type: "boolean" },
				tags: { type: "array", items: { type: "string" } },
				saveIds: { type: "array", items: { type: "string" } },
			},
			required: ["message", "target"],
		},
	},
	{
		name: "update_reminder",
		description:
			"Update a standalone reminder's message, target time, escalation, tags, or linked saveIds.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
				message: { type: "string" },
				target: {
					oneOf: [{ type: "integer" }, { type: "string" }],
				},
				escalate: { type: "boolean" },
				tags: { type: "array", items: { type: "string" } },
				saveIds: { type: "array", items: { type: "string" } },
			},
			required: ["id"],
		},
	},
	{
		name: "delete_reminder",
		description: "Delete a standalone reminder by id.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
			},
			required: ["id"],
		},
	},
	{
		name: "update_image",
		description: "Update a saved image's title or tags.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
				title: { type: "string" },
				tags: { type: "array", items: { type: "string" } },
			},
			required: ["id"],
		},
	},
	{
		name: "delete_image",
		description: "Delete a saved image by id.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
			},
			required: ["id"],
		},
	},
	{
		name: "link_records",
		description:
			"Link a note, task, or reminder (fromId) to a save (toId), or a reminder to a task.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				fromId: { type: "string" },
				toId: { type: "string" },
			},
			required: ["fromId", "toId"],
		},
	},
	{
		name: "unlink_records",
		description: "Remove a link between fromId and toId.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				fromId: { type: "string" },
				toId: { type: "string" },
			},
			required: ["fromId", "toId"],
		},
	},
];

const MCP_RESOURCES = [
	{
		uri: "littlelater://saves",
		name: "Saved pages",
		mimeType: "application/json",
	},
	{
		uri: "littlelater://history",
		name: "Browsing history",
		mimeType: "application/json",
	},
	{
		uri: "littlelater://tasks",
		name: "Tasks",
		mimeType: "application/json",
	},
	{
		uri: "littlelater://reminders",
		name: "Reminders",
		mimeType: "application/json",
	},
	{
		uri: "littlelater://notes",
		name: "Notes (excluding locked notes)",
		mimeType: "application/json",
	},
	{
		uri: "littlelater://images",
		name: "Saved images metadata",
		mimeType: "application/json",
	},
	{
		uri: "littlelater://links",
		name: "Record links (excluding locked notes)",
		mimeType: "application/json",
	},
	{
		uri: "littlelater://tags",
		name: "Tags summary",
		mimeType: "application/json",
	},
];

const owned = (profileId: string) =>
	[
		[profileId, Dexie.minKey],
		[profileId, Dexie.maxKey],
	] as const;

const readSavesFrom = async (
	db: LittleDB,
	keys: ProfileKeys,
): Promise<Array<Save>> => listSaves(db, keys, true);

const readHistoryFrom = async (
	db: LittleDB,
	keys: ProfileKeys,
): Promise<Array<Save>> => listSaves(db, keys, false);

const readLockedNoteIds = async (
	db: LittleDB,
	keys: ProfileKeys,
): Promise<Set<string>> => {
	const rows = await db.notes
		.where("[profileId+keyId]")
		.between(...owned(keys.profileId))
		.toArray();
	const locked = new Set<string>();
	for (const row of rows) {
		try {
			const note = await openNote(keys, row);
			if (note.locked) locked.add(note.id);
		} catch {
			locked.add(row.id);
		}
	}
	return locked;
};

// Security invariant: locked notes are strictly excluded from external MCP.
const readUnlockedNotesFrom = async (
	db: LittleDB,
	keys: ProfileKeys,
): Promise<Array<Note>> =>
	(
		await openEach(
			"notes",
			await db.notes
				.where("[profileId+updatedAt]")
				.between(...owned(keys.profileId))
				.reverse()
				.toArray(),
			(row) => openNote(keys, row),
		)
	).filter((note) => !note.locked);

const isNoteLocked = async (
	db: LittleDB,
	keys: ProfileKeys,
	id: string,
): Promise<boolean> => {
	const row = await db.notes.get(id);
	if (!row || row.profileId !== keys.profileId) return false;
	try {
		const note = await openNote(keys, row);
		return Boolean(note.locked);
	} catch {
		return true;
	}
};

const readTasksFrom = async (
	db: LittleDB,
	keys: ProfileKeys,
	includeFinished = true,
): Promise<Array<Task>> => {
	const open = await listTasks(db, keys, false);
	if (!includeFinished) return open;
	const finished = await listTasks(db, keys, true);
	return [...open, ...finished];
};

const readRemindersFrom = async (
	db: LittleDB,
	keys: ProfileKeys,
	includeFired = false,
): Promise<Array<Reminder>> => {
	if (!includeFired) {
		return listReminders(db, keys);
	}
	return openEach(
		"reminders",
		await db.reminders
			.where("[profileId+keyId]")
			.between(...owned(keys.profileId))
			.toArray(),
		(row) => openReminder(keys, row),
	);
};

const readImagesFrom = async (
	db: LittleDB,
	keys: ProfileKeys,
): Promise<Array<ImageRecord>> => listImages(db, keys);

const readSafeLinksFrom = async (db: LittleDB, keys: ProfileKeys) => {
	const [links, lockedIds] = await Promise.all([
		db.links
			.where("[profileId+fromId]")
			.between(...owned(keys.profileId))
			.toArray(),
		readLockedNoteIds(db, keys),
	]);
	return links.filter(
		(link) => !lockedIds.has(link.fromId) && !lockedIds.has(link.toId),
	);
};

const readTagsSummary = async (
	db: LittleDB,
	keys: ProfileKeys,
): Promise<Array<{ tag: string; count: number }>> => {
	const [saves, tasks, reminders, notes, images] = await Promise.all([
		readSavesFrom(db, keys),
		readTasksFrom(db, keys),
		readRemindersFrom(db, keys, true),
		readUnlockedNotesFrom(db, keys),
		readImagesFrom(db, keys),
	]);
	const counts = new Map<string, number>();
	for (const record of [
		...saves,
		...tasks,
		...reminders,
		...notes,
		...images,
	]) {
		for (const tag of record.tags ?? []) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
};

const filterTag = <T extends { tags?: Array<string> }>(
	items: Array<T>,
	tag: unknown,
): Array<T> => {
	if (typeof tag !== "string" || tag.trim() === "") return items;
	const target = normalizeTag(tag);
	if (!target) return items;
	return items.filter((item) =>
		(item.tags ?? []).some((t) => t.toLowerCase() === target),
	);
};

const shapeSaveForMcp = (
	save: Save,
	includeSnapshot: boolean,
): Record<string, unknown> => {
	if (includeSnapshot || !save.snapshot) {
		return save;
	}
	const { snapshot, ...rest } = save;
	return {
		...rest,
		hasSnapshot: true,
		snapshotExcerpt: snapshot.slice(0, 300),
	};
};

const clampLimit = (value: unknown, fallback = 50): number => {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.max(1, Math.min(200, Math.trunc(value)));
};

/**
 * Parses an epoch-millisecond timestamp or ISO-8601 date-time string into
 * epoch milliseconds, returning `undefined` when invalid.
 */
export const parseMcpInstant = (value: unknown): number | undefined => {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return Math.trunc(value);
	}
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Date.parse(value.trim());
		if (Number.isFinite(parsed) && parsed > 0) {
			return Math.trunc(parsed);
		}
	}
	return undefined;
};

const todayIsoDate = (now = Date.now()): string => {
	const d = new Date(now);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const parseRecurrenceRuleInput = (
	raw: unknown,
	now = Date.now(),
): RecurrenceRule => {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new ScheduleError("recurrence must be an object.");
	}
	const obj = raw as Record<string, unknown>;
	const freq =
		typeof obj.freq === "string"
			? (obj.freq.trim().toLowerCase() as Frequency)
			: obj.freq;
	return parseRule({
		...obj,
		freq,
		interval: obj.interval ?? 1,
		time: obj.time ?? "09:00",
		anchor: obj.anchor ?? todayIsoDate(now),
		zone: obj.zone ?? "floating",
	});
};

/**
 * Parses flexible MCP task schedule arguments (`schedule`, `recurrence`, or
 * `dueAt`) into a validated `TaskSchedule`. Returns `undefined` when no
 * schedule fields were provided (useful for partial `update_task` calls).
 */
export const parseMcpTaskSchedule = (
	args: Record<string, unknown>,
	now = Date.now(),
): TaskSchedule | undefined => {
	if (args.schedule !== undefined) {
		if (
			!args.schedule ||
			typeof args.schedule !== "object" ||
			Array.isArray(args.schedule)
		) {
			throw new ScheduleError("schedule must be an object.");
		}
		const sched = args.schedule as Record<string, unknown>;
		if (sched.kind === "anytime") {
			return { kind: "anytime" };
		}
		if (sched.kind === "due") {
			const at = parseMcpInstant(sched.at);
			if (at === undefined) {
				throw new ScheduleError(
					"schedule.at must be a valid epoch millisecond timestamp or ISO-8601 string.",
				);
			}
			return { kind: "due", at };
		}
		if (sched.kind === "recurring") {
			return {
				kind: "recurring",
				rule: parseRecurrenceRuleInput(sched.rule, now),
			};
		}
		throw new ScheduleError(
			"schedule.kind must be anytime, due, or recurring.",
		);
	}
	if (args.recurrence !== undefined) {
		return {
			kind: "recurring",
			rule: parseRecurrenceRuleInput(args.recurrence, now),
		};
	}
	if (args.dueAt !== undefined) {
		if (args.dueAt === null) {
			return { kind: "anytime" };
		}
		const at = parseMcpInstant(args.dueAt);
		if (at === undefined) {
			throw new ScheduleError(
				"dueAt must be a valid epoch millisecond timestamp, ISO-8601 string, or null.",
			);
		}
		return { kind: "due", at };
	}
	return undefined;
};

const parseReminderKind = (
	value: unknown,
): "normal" | "escalating" | null | undefined => {
	if (value === undefined) return undefined;
	if (value === null || value === false) return null;
	if (value === true || value === "normal") return "normal";
	if (value === "escalating") return "escalating";
	throw new Error("reminder must be 'normal', 'escalating', or null.");
};

const parsePriority = (value: unknown) => {
	if (value === undefined) return undefined;
	if (
		value === LTASK_PRIORITY.LOW ||
		value === LTASK_PRIORITY.MEDIUM ||
		value === LTASK_PRIORITY.HIGH
	) {
		return value;
	}
	throw new Error("priority must be low, medium, or high.");
};

const ok = (id: string | number | null, result: unknown): JsonRpcResponse => ({
	jsonrpc: "2.0",
	id,
	result,
});

const fail = (
	id: string | number | null,
	code: number,
	message: string,
): JsonRpcResponse => ({
	jsonrpc: "2.0",
	id,
	error: { code, message },
});

const textToolResult = (data: unknown) => ({
	content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

export const handleExternalMcpRequest = async ({
	db,
	session,
	dispatch,
	request,
}: {
	db: LittleDB;
	session: SessionStore;
	dispatch: Dispatch;
	request: JsonRpcRequest;
}): Promise<JsonRpcResponse | null> => {
	const isNotification =
		request.id === undefined ||
		(typeof request.method === "string" &&
			request.method.startsWith("notifications/"));
	const id = request.id ?? null;
	const method = request.method;

	if (method === "initialize") {
		const requestedVersion =
			typeof request.params?.protocolVersion === "string" &&
			request.params.protocolVersion.trim() !== ""
				? request.params.protocolVersion
				: "2024-11-05";
		const version =
			typeof chrome !== "undefined" && chrome.runtime?.getManifest
				? chrome.runtime.getManifest().version
				: "3.2.0";
		return ok(id, {
			protocolVersion: requestedVersion,
			capabilities: {
				tools: {},
				resources: {},
			},
			serverInfo: {
				name: "little-later",
				version,
			},
		});
	}

	if (isNotification) {
		return null;
	}

	if (method === "ping") {
		return ok(id, {});
	}

	if (method === "prompts/list") {
		return ok(id, { prompts: [] });
	}

	if (method === "resources/templates/list") {
		return ok(id, { resourceTemplates: [] });
	}

	const unlocked = await session.get();
	if (!unlocked) {
		return fail(
			id,
			-32001,
			"Profile is locked. Unlock Little Later first.",
		);
	}
	const keys = await importProfileKeys(unlocked);
	const settings = await getSettings(db, keys);
	const mode: LExternalMcpMode = settings.misc.externalMcpMode ?? "off";
	if (mode === "off") {
		return fail(
			id,
			-32003,
			"External agent MCP access is disabled in Little Later Data & Privacy settings.",
		);
	}

	if (method === "tools/list") {
		const allowed = MCP_TOOLS.filter(
			(tool) => !tool.write || mode === "write",
		).map(({ name, description, inputSchema }) => ({
			name,
			description,
			inputSchema,
		}));
		return ok(id, { tools: allowed });
	}

	if (method === "resources/list") {
		return ok(id, { resources: MCP_RESOURCES });
	}

	if (method === "resources/read") {
		const uri =
			typeof request.params?.uri === "string" ? request.params.uri : "";
		let payload: unknown;
		if (uri === "littlelater://saves") {
			payload = await readSavesFrom(db, keys);
		} else if (uri === "littlelater://history") {
			payload = await readHistoryFrom(db, keys);
		} else if (uri === "littlelater://tasks") {
			payload = await readTasksFrom(db, keys);
		} else if (uri === "littlelater://reminders") {
			payload = await readRemindersFrom(db, keys);
		} else if (uri === "littlelater://notes") {
			payload = await readUnlockedNotesFrom(db, keys);
		} else if (uri === "littlelater://images") {
			payload = await readImagesFrom(db, keys);
		} else if (uri === "littlelater://links") {
			payload = await readSafeLinksFrom(db, keys);
		} else if (uri === "littlelater://tags") {
			payload = await readTagsSummary(db, keys);
		} else {
			return fail(id, -32602, `Unknown resource: ${uri}`);
		}
		return ok(id, {
			contents: [
				{
					uri,
					mimeType: "application/json",
					text: JSON.stringify(payload, null, 2),
				},
			],
		});
	}

	if (method === "tools/call") {
		const toolName =
			typeof request.params?.name === "string" ? request.params.name : "";
		const args =
			request.params?.arguments &&
			typeof request.params.arguments === "object" &&
			!Array.isArray(request.params.arguments)
				? (request.params.arguments as Record<string, unknown>)
				: {};
		const def = MCP_TOOLS.find((tool) => tool.name === toolName);
		if (!def) {
			return fail(id, -32601, `Unknown tool: ${toolName}`);
		}
		if (def.write && mode !== "write") {
			return fail(
				id,
				-32003,
				"Write access is disabled. Switch External agent MCP to Read & write in Data & Privacy settings.",
			);
		}
		const owner = {
			profileId: keys.profileId,
			unlockId: unlocked.unlockId,
		};

		try {
			switch (toolName) {
				case "list_saves": {
					const includeArchived = Boolean(args.includeArchived);
					const includeSnapshot = Boolean(args.includeSnapshot);
					let saves = await readSavesFrom(db, keys);
					if (!includeArchived) {
						saves = saves.filter((save) => !save.archived);
					}
					const picked = filterTag(saves, args.tag)
						.slice(0, clampLimit(args.limit))
						.map((save) => shapeSaveForMcp(save, includeSnapshot));
					return ok(id, textToolResult(picked));
				}
				case "list_history": {
					const history = (await readHistoryFrom(db, keys))
						.slice(0, clampLimit(args.limit))
						.map((save) => shapeSaveForMcp(save, false));
					return ok(id, textToolResult(history));
				}
				case "list_tasks": {
					const includeFinished = args.includeFinished !== false;
					const priorityFilter = parsePriority(args.priority);
					let tasks = filterTag(
						await readTasksFrom(db, keys, includeFinished),
						args.tag,
					);
					if (priorityFilter !== undefined) {
						tasks = tasks.filter(
							(task) => task.priority === priorityFilter,
						);
					}
					return ok(
						id,
						textToolResult(tasks.slice(0, clampLimit(args.limit))),
					);
				}
				case "list_reminders": {
					const includeFired = Boolean(args.includeFired);
					const reminders = filterTag(
						await readRemindersFrom(db, keys, includeFired),
						args.tag,
					).slice(0, clampLimit(args.limit));
					return ok(id, textToolResult(reminders));
				}
				case "list_notes": {
					const notes = filterTag(
						await readUnlockedNotesFrom(db, keys),
						args.tag,
					).slice(0, clampLimit(args.limit));
					return ok(id, textToolResult(notes));
				}
				case "get_note": {
					const noteId = typeof args.id === "string" ? args.id : "";
					if (!noteId) {
						return fail(id, -32602, "id is required.");
					}
					const notes = await readUnlockedNotesFrom(db, keys);
					const found = notes.find((note) => note.id === noteId);
					if (!found) {
						return fail(id, -32602, "Note not found.");
					}
					return ok(id, textToolResult(found));
				}
				case "list_images": {
					const images = filterTag(
						await readImagesFrom(db, keys),
						args.tag,
					).slice(0, clampLimit(args.limit));
					return ok(id, textToolResult(images));
				}
				case "list_links": {
					const recordId =
						typeof args.recordId === "string"
							? args.recordId.trim()
							: "";
					const links = await readSafeLinksFrom(db, keys);
					const filtered =
						recordId !== ""
							? links.filter(
									(link) =>
										link.fromId === recordId ||
										link.toId === recordId,
								)
							: links;
					return ok(id, textToolResult(filtered));
				}
				case "list_tags": {
					return ok(
						id,
						textToolResult(await readTagsSummary(db, keys)),
					);
				}
				case "search_all": {
					const query =
						typeof args.query === "string" ? args.query.trim() : "";
					const limit = clampLimit(args.limit, 10);
					const [saves, tasks, reminders, notes, images] =
						await Promise.all([
							readSavesFrom(db, keys),
							readTasksFrom(db, keys),
							readRemindersFrom(db, keys),
							readUnlockedNotesFrom(db, keys),
							readImagesFrom(db, keys),
						]);
					const pick = <T extends { tags?: Array<string> }>(
						items: Array<T>,
						getText: (item: T) => string,
					) => {
						const tagged = filterTag(items, args.tag);
						if (!query) return tagged.slice(0, limit);
						return hybridRank(tagged, query, getText)
							.slice(0, limit)
							.map((entry) => entry.item);
					};
					return ok(
						id,
						textToolResult({
							saves: pick(saves, (s) =>
								[
									s.customName,
									s.title,
									s.url,
									...(s.tags ?? []),
									s.snapshot?.slice(0, 2_000) ?? "",
								].join(" "),
							),
							tasks: pick(tasks, (t) =>
								[
									t.label,
									t.information,
									...(t.tags ?? []),
								].join(" "),
							),
							reminders: pick(reminders, (r) =>
								[r.message, ...(r.tags ?? [])].join(" "),
							),
							notes: pick(notes, (n) =>
								[
									n.title ?? "",
									n.content,
									...(n.tags ?? []),
								].join(" "),
							),
							images: pick(images, (img) =>
								[
									img.title,
									img.sourceUrl ?? "",
									...(img.tags ?? []),
								].join(" "),
							),
						}),
					);
				}
				case "get_productivity_overview": {
					const now = Date.now();
					const [saves, tasks, reminders, notes, images] =
						await Promise.all([
							readSavesFrom(db, keys),
							readTasksFrom(db, keys, true),
							readRemindersFrom(db, keys, false),
							readUnlockedNotesFrom(db, keys),
							readImagesFrom(db, keys),
						]);
					const openTasks = tasks.filter((t) => !t.done);
					const overdueTasks = openTasks.filter(
						(t) => t.dueAt > 0 && t.dueAt < now,
					);
					const upcomingTasks = openTasks
						.filter((t) => t.dueAt > 0)
						.sort((a, b) => a.dueAt - b.dueAt)
						.slice(0, 5);
					const upcomingReminders = [...reminders]
						.sort((a, b) => a.target - b.target)
						.slice(0, 5);
					return ok(
						id,
						textToolResult({
							counts: {
								saves: saves.filter((s) => !s.archived).length,
								archivedSaves: saves.filter((s) => s.archived)
									.length,
								openTasks: openTasks.length,
								overdueTasks: overdueTasks.length,
								completedTasks: tasks.filter((t) => t.done)
									.length,
								pendingReminders: reminders.length,
								unlockedNotes: notes.length,
								images: images.length,
							},
							upcomingTasks,
							upcomingReminders,
						}),
					);
				}
				case "create_save": {
					const captured = await dispatch(
						"save.capture",
						{
							url: args.url,
							title:
								typeof args.title === "string"
									? args.title
									: undefined,
							saved: true,
							snapshot:
								typeof args.snapshot === "string"
									? args.snapshot
									: undefined,
						},
						owner,
					);
					if (!captured.ok) {
						return fail(id, -32602, captured.error.message);
					}
					const value = captured.value as {
						id: string;
						created: boolean;
					};
					if (
						typeof args.customName === "string" ||
						Array.isArray(args.tags)
					) {
						const updated = await dispatch(
							"save.update",
							{
								id: value.id,
								...(typeof args.customName === "string"
									? { customName: args.customName }
									: {}),
								...(Array.isArray(args.tags)
									? { tags: args.tags }
									: {}),
							},
							owner,
						);
						if (!updated.ok) {
							return fail(id, -32602, updated.error.message);
						}
					}
					return ok(id, textToolResult(value));
				}
				case "update_save": {
					const result = await dispatch(
						"save.update",
						{
							id: args.id,
							...(typeof args.customName === "string"
								? { customName: args.customName }
								: {}),
							...(typeof args.archived === "boolean"
								? { archived: args.archived }
								: {}),
							...(typeof args.saved === "boolean"
								? { saved: args.saved }
								: {}),
							...(Array.isArray(args.tags)
								? { tags: args.tags }
								: {}),
							...(args.snapshot !== undefined
								? { snapshot: args.snapshot }
								: {}),
						},
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult(result.value));
				}
				case "delete_save": {
					const result = await dispatch(
						"save.delete",
						{ id: args.id },
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult({ deleted: true }));
				}
				case "create_note": {
					const result = await dispatch(
						"note.create",
						{
							title:
								typeof args.title === "string"
									? args.title
									: undefined,
							content: args.content,
							tags: Array.isArray(args.tags)
								? args.tags
								: undefined,
							saveIds: Array.isArray(args.saveIds)
								? args.saveIds
								: undefined,
						},
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult(result.value));
				}
				case "update_note": {
					const noteId = typeof args.id === "string" ? args.id : "";
					if (await isNoteLocked(db, keys, noteId)) {
						return fail(
							id,
							-32003,
							"Locked notes cannot be modified via external MCP.",
						);
					}
					const result = await dispatch(
						"note.update",
						{
							id: args.id,
							content: args.content,
							...(typeof args.title === "string"
								? { title: args.title }
								: {}),
							...(Array.isArray(args.tags)
								? { tags: args.tags }
								: {}),
							...(Array.isArray(args.saveIds)
								? { saveIds: args.saveIds }
								: {}),
						},
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult({ updated: true }));
				}
				case "delete_note": {
					const noteId = typeof args.id === "string" ? args.id : "";
					if (await isNoteLocked(db, keys, noteId)) {
						return fail(
							id,
							-32003,
							"Locked notes cannot be deleted via external MCP.",
						);
					}
					const result = await dispatch(
						"note.delete",
						{ id: args.id },
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult({ deleted: true }));
				}
				case "create_task": {
					const priority = parsePriority(args.priority);
					const schedule = parseMcpTaskSchedule(args) ?? {
						kind: "anytime" as const,
					};
					const reminder = parseReminderKind(args.reminder) ?? null;
					const result = await dispatch(
						"task.create",
						{
							information: args.information,
							label:
								typeof args.label === "string"
									? args.label
									: undefined,
							priority,
							schedule,
							reminder,
							tags: Array.isArray(args.tags)
								? args.tags
								: undefined,
							saveIds: Array.isArray(args.saveIds)
								? args.saveIds
								: undefined,
						},
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult(result.value));
				}
				case "update_task": {
					const priority = parsePriority(args.priority);
					const schedule = parseMcpTaskSchedule(args);
					const reminder = parseReminderKind(args.reminder);
					const result = await dispatch(
						"task.update",
						{
							id: args.id,
							...(typeof args.information === "string"
								? { information: args.information }
								: {}),
							...(typeof args.label === "string"
								? { label: args.label }
								: {}),
							...(priority !== undefined ? { priority } : {}),
							...(schedule !== undefined ? { schedule } : {}),
							...(reminder !== undefined ? { reminder } : {}),
							...(Array.isArray(args.tags)
								? { tags: args.tags }
								: {}),
							...(Array.isArray(args.saveIds)
								? { saveIds: args.saveIds }
								: {}),
						},
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult({ updated: true }));
				}
				case "complete_task": {
					const result = await dispatch(
						"task.complete",
						{ id: args.id },
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult(result.value));
				}
				case "reopen_task": {
					const result = await dispatch(
						"task.reopen",
						{ id: args.id },
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult({ reopened: true }));
				}
				case "delete_task": {
					const result = await dispatch(
						"task.delete",
						{ id: args.id },
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult({ deleted: true }));
				}
				case "create_reminder": {
					const target = parseMcpInstant(args.target);
					if (target === undefined) {
						return fail(
							id,
							-32602,
							"target must be a valid epoch millisecond timestamp or ISO-8601 string.",
						);
					}
					const result = await dispatch(
						"reminder.create",
						{
							message: args.message,
							target,
							escalate: Boolean(args.escalate),
							tags: Array.isArray(args.tags)
								? args.tags
								: undefined,
							saveIds: Array.isArray(args.saveIds)
								? args.saveIds
								: undefined,
						},
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult(result.value));
				}
				case "update_reminder": {
					const target =
						args.target === undefined
							? undefined
							: parseMcpInstant(args.target);
					if (args.target !== undefined && target === undefined) {
						return fail(
							id,
							-32602,
							"target must be a valid epoch millisecond timestamp or ISO-8601 string.",
						);
					}
					const result = await dispatch(
						"reminder.update",
						{
							id: args.id,
							...(typeof args.message === "string"
								? { message: args.message }
								: {}),
							...(target !== undefined ? { target } : {}),
							...(typeof args.escalate === "boolean"
								? { escalate: args.escalate }
								: {}),
							...(Array.isArray(args.tags)
								? { tags: args.tags }
								: {}),
							...(Array.isArray(args.saveIds)
								? { saveIds: args.saveIds }
								: {}),
						},
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult({ updated: true }));
				}
				case "delete_reminder": {
					const result = await dispatch(
						"reminder.delete",
						{ id: args.id },
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult({ deleted: true }));
				}
				case "update_image": {
					const result = await dispatch(
						"image.update",
						{
							id: args.id,
							...(typeof args.title === "string"
								? { title: args.title }
								: {}),
							...(Array.isArray(args.tags)
								? { tags: args.tags }
								: {}),
						},
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult({ updated: true }));
				}
				case "delete_image": {
					const result = await dispatch(
						"image.delete",
						{ id: args.id },
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult({ deleted: true }));
				}
				case "link_records": {
					const fromId =
						typeof args.fromId === "string" ? args.fromId : "";
					if (await isNoteLocked(db, keys, fromId)) {
						return fail(
							id,
							-32003,
							"Locked notes cannot be linked via external MCP.",
						);
					}
					const result = await dispatch(
						"link.create",
						{ fromId: args.fromId, toId: args.toId },
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult({ linked: true }));
				}
				case "unlink_records": {
					const fromId =
						typeof args.fromId === "string" ? args.fromId : "";
					if (await isNoteLocked(db, keys, fromId)) {
						return fail(
							id,
							-32003,
							"Locked notes cannot be unlinked via external MCP.",
						);
					}
					const result = await dispatch(
						"link.delete",
						{ fromId: args.fromId, toId: args.toId },
						owner,
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult({ unlinked: true }));
				}
				default:
					return fail(id, -32601, `Unknown tool: ${toolName}`);
			}
		} catch (error) {
			if (error instanceof ScheduleError) {
				return fail(id, -32602, error.message);
			}
			return fail(
				id,
				-32000,
				error instanceof Error ? error.message : "MCP request failed.",
			);
		}
	}

	return fail(id, -32601, `Method not supported: ${String(method ?? "")}`);
};

const RECONNECT_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

// Manages the optional Chrome Native Messaging port to the local MCP bridge.
// Connects only when a profile is unlocked AND externalMcpMode !== "off".
export const createNativeMcpBridge = ({
	db,
	session,
	dispatch,
}: {
	db: LittleDB;
	session: SessionStore;
	dispatch: Dispatch;
}) => {
	let port: chrome.runtime.Port | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let reconnectAttempt = 0;
	let syncGeneration = 0;

	const clearReconnect = () => {
		if (reconnectTimer !== null) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	};

	const disconnect = () => {
		syncGeneration += 1;
		clearReconnect();
		reconnectAttempt = 0;
		if (port) {
			try {
				port.disconnect();
			} catch {
				// Ignore already-closed ports.
			}
			port = null;
		}
	};

	const scheduleReconnect = () => {
		clearReconnect();
		const delay =
			RECONNECT_DELAYS_MS[
				Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)
			];
		reconnectAttempt += 1;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			void sync();
		}, delay);
	};

	const sync = async (): Promise<void> => {
		if (typeof chrome === "undefined" || !chrome.runtime?.connectNative) {
			return;
		}
		const gen = ++syncGeneration;
		const unlocked = await session.get();
		if (gen !== syncGeneration) return;
		if (!unlocked) {
			disconnect();
			return;
		}
		let mode: LExternalMcpMode;
		try {
			const keys = await importProfileKeys(unlocked);
			const settings = await getSettings(db, keys);
			if (gen !== syncGeneration) return;
			mode = settings.misc.externalMcpMode ?? "off";
		} catch {
			if (gen === syncGeneration) disconnect();
			return;
		}
		if (mode === "off") {
			disconnect();
			return;
		}
		if (port) {
			return;
		}
		clearReconnect();
		try {
			const nextPort = chrome.runtime.connectNative(
				EXTERNAL_MCP_HOST_NAME,
			);
			port = nextPort;
			nextPort.onMessage.addListener((rawMessage: unknown) => {
				reconnectAttempt = 0;
				if (!rawMessage || typeof rawMessage !== "object") return;
				const envelope = rawMessage as {
					bridgeId?: string;
					request?: JsonRpcRequest;
				};
				const request =
					envelope.request ?? (rawMessage as JsonRpcRequest);
				void handleExternalMcpRequest({
					db,
					session,
					dispatch,
					request,
				}).then((response) => {
					if (response === null) return;
					try {
						nextPort.postMessage(
							envelope.bridgeId
								? { bridgeId: envelope.bridgeId, response }
								: response,
						);
					} catch {
						// Port closed before reply.
					}
				});
			});
			nextPort.onDisconnect.addListener(() => {
				// Read lastError so Chrome does not log an unchecked error when
				// the native host is not installed yet.
				void chrome.runtime.lastError;
				if (port === nextPort) {
					port = null;
					scheduleReconnect();
				}
			});
		} catch {
			port = null;
			scheduleReconnect();
		}
	};

	return { sync, disconnect };
};
