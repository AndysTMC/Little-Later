import Dexie from "dexie";
import { LTASK_PRIORITY } from "little-shared/enums";
import type { LExternalMcpMode } from "little-shared/types";
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
import type { LittleDB } from "../storage/schema";
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

const MCP_TOOLS: ReadonlyArray<McpToolDef> = [
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
		name: "list_tasks",
		description: "List tasks from the unlocked profile.",
		inputSchema: {
			type: "object",
			properties: {
				includeFinished: { type: "boolean" },
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
		name: "create_note",
		description: "Create a new note in the unlocked profile.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				title: { type: "string" },
				content: { type: "string" },
				tags: { type: "array", items: { type: "string" } },
			},
			required: ["content"],
		},
	},
	{
		name: "create_task",
		description:
			"Create a new task in the unlocked profile (optional dueAt in epoch milliseconds).",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				information: { type: "string" },
				label: { type: "string" },
				priority: { type: "string", enum: ["low", "medium", "high"] },
				dueAt: { type: "integer" },
				tags: { type: "array", items: { type: "string" } },
			},
			required: ["information"],
		},
	},
	{
		name: "create_reminder",
		description:
			"Create a new reminder in the unlocked profile (target is epoch milliseconds).",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				message: { type: "string" },
				target: { type: "integer" },
				escalate: { type: "boolean" },
				tags: { type: "array", items: { type: "string" } },
			},
			required: ["message", "target"],
		},
	},
	{
		name: "complete_task",
		description: "Mark a task completed by id.",
		write: true,
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
			},
			required: ["id"],
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
				: "3.1.0";
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
		} else if (uri === "littlelater://tasks") {
			payload = await readTasksFrom(db, keys);
		} else if (uri === "littlelater://reminders") {
			payload = await readRemindersFrom(db, keys);
		} else if (uri === "littlelater://notes") {
			payload = await readUnlockedNotesFrom(db, keys);
		} else if (uri === "littlelater://images") {
			payload = await readImagesFrom(db, keys);
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
				case "list_tasks": {
					const includeFinished = args.includeFinished !== false;
					const tasks = filterTag(
						await readTasksFrom(db, keys, includeFinished),
						args.tag,
					).slice(0, clampLimit(args.limit));
					return ok(id, textToolResult(tasks));
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
				case "list_images": {
					const images = filterTag(
						await readImagesFrom(db, keys),
						args.tag,
					).slice(0, clampLimit(args.limit));
					return ok(id, textToolResult(images));
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
						},
						{
							profileId: keys.profileId,
							unlockId: unlocked.unlockId,
						},
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult(result.value));
				}
				case "create_task": {
					const priority =
						args.priority === LTASK_PRIORITY.LOW ||
						args.priority === LTASK_PRIORITY.MEDIUM ||
						args.priority === LTASK_PRIORITY.HIGH
							? args.priority
							: undefined;
					const schedule =
						typeof args.dueAt === "number" &&
						Number.isFinite(args.dueAt) &&
						args.dueAt > 0
							? {
									kind: "due" as const,
									at: Math.trunc(args.dueAt),
								}
							: { kind: "anytime" as const };
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
							reminder: null,
							tags: Array.isArray(args.tags)
								? args.tags
								: undefined,
						},
						{
							profileId: keys.profileId,
							unlockId: unlocked.unlockId,
						},
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult(result.value));
				}
				case "create_reminder": {
					const result = await dispatch(
						"reminder.create",
						{
							message: args.message,
							target: args.target,
							escalate: Boolean(args.escalate),
							tags: Array.isArray(args.tags)
								? args.tags
								: undefined,
						},
						{
							profileId: keys.profileId,
							unlockId: unlocked.unlockId,
						},
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult(result.value));
				}
				case "complete_task": {
					const result = await dispatch(
						"task.complete",
						{ id: args.id },
						{
							profileId: keys.profileId,
							unlockId: unlocked.unlockId,
						},
					);
					if (!result.ok) {
						return fail(id, -32602, result.error.message);
					}
					return ok(id, textToolResult(result.value));
				}
				default:
					return fail(id, -32601, `Unknown tool: ${toolName}`);
			}
		} catch (error) {
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
				// the user has not installed the optional companion CLI yet.
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
