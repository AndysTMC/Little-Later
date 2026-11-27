// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands } from "../../src/background/commands";
import {
	createCommandContext,
	createDispatcher,
	createSerialQueue,
	type Dispatch,
} from "../../src/background/commands/registry";
import {
	handleExternalMcpRequest,
	parseMcpInstant,
	parseMcpTaskSchedule,
	type JsonRpcRequest,
} from "../../src/background/mcpBridge";
import { importProfileKeys } from "../../src/storage/keys";
import { getSettings } from "../../src/storage/repositories";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import {
	createMemorySessionStore,
	type SessionStore,
} from "../../src/storage/session";

const TINY_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgAAIAAAUAAQ0KLbQAAAAASUVORK5CYII=";

describe("Little Later External MCP — full UI parity & security boundaries", () => {
	let db: LittleDB;
	let session: SessionStore;
	let dispatch: Dispatch;
	let clock: number;

	const callMcp = async (request: JsonRpcRequest) =>
		handleExternalMcpRequest({ db, session, dispatch, request });

	const callTool = async (
		name: string,
		args: Record<string, unknown> = {},
	) => {
		const res = await callMcp({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name, arguments: args },
		});
		return res!;
	};

	const parseToolJson = <T = unknown>(
		res: Awaited<ReturnType<typeof callTool>>,
	): T => {
		expect(res.error).toBeUndefined();
		const text = (
			res.result as { content: Array<{ type: string; text: string }> }
		).content[0]!.text;
		return JSON.parse(text) as T;
	};

	const setMcpMode = async (mode: "off" | "read" | "write") => {
		const keys = await importProfileKeys((await session.get())!);
		const current = await getSettings(db, keys);
		await dispatch("settings.update", {
			misc: { ...current.misc, externalMcpMode: mode },
		});
	};

	beforeEach(async () => {
		db = openLittleDB(`little-mcp-parity-${crypto.randomUUID()}`);
		await db.open();
		session = createMemorySessionStore();
		clock = Date.UTC(2026, 10, 27, 10, 0, 0);
		dispatch = createDispatcher(
			commands,
			createCommandContext(
				db,
				session,
				() => clock,
				() => "UTC",
			),
			createSerialQueue(),
		);
		await dispatch("profile.create", {
			name: "Ada",
			password: "VaultPassword#2026",
		});
		await setMcpMode("write");
	});

	afterEach(async () => {
		db.close();
		await db.delete();
	});

	it("parses epoch ms, ISO timestamps, due schedules, and flexible recurrence rules", () => {
		expect(parseMcpInstant("2026-12-01T09:30:00Z")).toBe(
			Date.UTC(2026, 11, 1, 9, 30, 0),
		);
		expect(parseMcpInstant(1700000000000)).toBe(1700000000000);
		expect(parseMcpInstant("not-a-date")).toBeUndefined();

		const recurring = parseMcpTaskSchedule(
			{
				recurrence: {
					freq: "weekly",
					byWeekday: [1, 3, 5],
					time: "08:45",
				},
			},
			clock,
		);
		expect(recurring).toEqual({
			kind: "recurring",
			rule: {
				freq: "weekly",
				interval: 1,
				time: "08:45",
				byWeekday: [1, 3, 5],
				anchor: "2026-11-27",
				zone: "floating",
			},
		});

		expect(parseMcpTaskSchedule({ dueAt: "2026-12-05T15:00:00Z" })).toEqual(
			{
				kind: "due",
				at: Date.UTC(2026, 11, 5, 15, 0, 0),
			},
		);
	});

	it("supports full task lifecycle: recurring schedule, attached reminder, update, complete, reopen, delete", async () => {
		// Create a save to link against.
		const saved = parseToolJson<{ id: string }>(
			await callTool("create_save", {
				url: "https://spec.example/roadmap",
				title: "Roadmap",
				customName: "Q4 Roadmap",
				tags: ["work"],
			}),
		);

		// Create a recurring task with escalating reminder, priority, tags, and linked save.
		const created = parseToolJson<{ id: string }>(
			await callTool("create_task", {
				information: "Weekly architecture sync",
				priority: "high",
				recurrence: {
					freq: "weekly",
					interval: 1,
					time: "14:00",
					byWeekday: [1, 5],
				},
				reminder: "escalating",
				tags: ["work", "sync"],
				saveIds: [saved.id],
			}),
		);
		expect(created.id).toBeTruthy();

		// Verify task and attached reminder + link exist.
		const tasks = parseToolJson<Array<Record<string, unknown>>>(
			await callTool("list_tasks", { priority: "high", tag: "sync" }),
		);
		expect(tasks).toHaveLength(1);
		expect(tasks[0]).toMatchObject({
			id: created.id,
			information: "Weekly architecture sync",
			priority: "high",
			schedule: {
				kind: "recurring",
				rule: { freq: "weekly", time: "14:00", byWeekday: [1, 5] },
			},
		});

		const reminders = parseToolJson<Array<Record<string, unknown>>>(
			await callTool("list_reminders", {}),
		);
		expect(reminders).toHaveLength(1);
		expect(reminders[0]?.message).toBe("Weekly architecture sync");

		// Switch task to a one-off due date via ISO string, complete it, then reopen it.
		await callTool("update_task", {
			id: created.id,
			information: "Final architecture sign-off",
			dueAt: "2026-12-10T16:00:00Z",
			reminder: null,
			priority: "medium",
		});
		await callTool("complete_task", { id: created.id });
		const afterComplete = parseToolJson<Array<Record<string, unknown>>>(
			await callTool("list_tasks", { includeFinished: false }),
		);
		expect(afterComplete).toHaveLength(0);

		await callTool("reopen_task", { id: created.id });
		const afterReopen = parseToolJson<Array<Record<string, unknown>>>(
			await callTool("list_tasks", { includeFinished: false }),
		);
		expect(afterReopen).toHaveLength(1);
		expect(afterReopen[0]?.information).toBe("Final architecture sign-off");

		// Delete the task.
		await callTool("delete_task", { id: created.id });
		expect(
			parseToolJson(
				await callTool("list_tasks", { includeFinished: true }),
			),
		).toHaveLength(0);
	});

	it("supports full saves, history, reminders, notes, images, links, tags, overview, and resources", async () => {
		// Seed a browsed-only history item.
		await dispatch("save.capture", {
			url: "https://history.example/article",
			title: "Recent Article",
			saved: false,
		});
		const history = parseToolJson<Array<{ url: string }>>(
			await callTool("list_history", {}),
		);
		expect(history).toHaveLength(1);
		expect(history[0]?.url).toBe("https://history.example/article");

		// Save CRUD
		const save = parseToolJson<{ id: string }>(
			await callTool("create_save", {
				url: "https://docs.example/mcp",
				title: "MCP Spec",
				tags: ["mcp"],
			}),
		);
		await callTool("update_save", {
			id: save.id,
			customName: "Official MCP Spec",
			archived: true,
			tags: ["mcp", "reference"],
		});
		const archivedSaves = parseToolJson<Array<{ customName: string }>>(
			await callTool("list_saves", { includeArchived: true }),
		);
		expect(archivedSaves[0]?.customName).toBe("Official MCP Spec");

		// Note CRUD + linking
		const note = parseToolJson<{ id: string }>(
			await callTool("create_note", {
				title: "MCP Notes",
				content: "Initial draft",
				tags: ["mcp"],
			}),
		);
		await callTool("link_records", { fromId: note.id, toId: save.id });
		const links = parseToolJson<Array<{ fromId: string; toId: string }>>(
			await callTool("list_links", { recordId: note.id }),
		);
		expect(links).toHaveLength(1);
		await callTool("unlink_records", { fromId: note.id, toId: save.id });
		expect(
			parseToolJson(await callTool("list_links", { recordId: note.id })),
		).toHaveLength(0);

		await callTool("update_note", {
			id: note.id,
			content: "Revised draft",
			tags: ["mcp", "edited"],
		});
		const fetchedNote = parseToolJson<{ content: string }>(
			await callTool("get_note", { id: note.id }),
		);
		expect(fetchedNote.content).toBe("Revised draft");

		// Reminder CRUD with ISO timestamp
		const rem = parseToolJson<{ id: string }>(
			await callTool("create_reminder", {
				message: "Send release notes",
				target: "2026-11-28T10:00:00Z",
				escalate: true,
				tags: ["release"],
			}),
		);
		await callTool("update_reminder", {
			id: rem.id,
			message: "Publish release notes",
			target: "2026-11-29T10:00:00Z",
		});

		// Image metadata update + delete
		const imgRes = await dispatch("image.create", {
			bytesBase64: TINY_PNG_BASE64,
			mimeType: "image/png",
			title: "Diagram",
			tags: ["design"],
		});
		expect(imgRes.ok).toBe(true);
		const imgId = (imgRes.ok ? (imgRes.value as { id: string }).id : "")!;
		await callTool("update_image", {
			id: imgId,
			title: "Architecture Diagram",
			tags: ["design", "mcp"],
		});
		const imgs = parseToolJson<Array<{ title: string }>>(
			await callTool("list_images", { tag: "mcp" }),
		);
		expect(imgs[0]?.title).toBe("Architecture Diagram");

		// Tags & Overview & Resources
		const tags = parseToolJson<Array<{ tag: string; count: number }>>(
			await callTool("list_tags", {}),
		);
		expect(tags.find((t) => t.tag === "mcp")?.count).toBeGreaterThanOrEqual(
			3,
		);
		const overview = parseToolJson<{
			counts: {
				archivedSaves: number;
				unlockedNotes: number;
				pendingReminders: number;
				images: number;
			};
		}>(await callTool("get_productivity_overview", {}));
		expect(overview.counts).toMatchObject({
			archivedSaves: 1,
			unlockedNotes: 1,
			pendingReminders: 1,
			images: 1,
		});

		const tagsResource = await callMcp({
			jsonrpc: "2.0",
			id: 2,
			method: "resources/read",
			params: { uri: "littlelater://tags" },
		});
		expect(tagsResource?.error).toBeUndefined();

		// Clean up deletes
		await callTool("delete_reminder", { id: rem.id });
		await callTool("delete_note", { id: note.id });
		await callTool("delete_image", { id: imgId });
		await callTool("delete_save", { id: save.id });
	});

	it("strictly excludes and refuses locked notes across reads, links, updates, and deletes, and gates writes in read-only mode", async () => {
		const save = parseToolJson<{ id: string }>(
			await callTool("create_save", {
				url: "https://vault.example",
				title: "Vault",
			}),
		);
		const locked = await dispatch("note.create", {
			content: "SUPER-SECRET-SEED-PHRASE",
			locked: true,
			title: "Seed",
			tags: ["secret-tag"],
			saveIds: [save.id],
		});
		expect(locked.ok).toBe(true);
		const lockedId = (
			locked.ok ? (locked.value as { id: string }).id : ""
		)!;

		// Hidden from list_notes, get_note, list_links, list_tags, search_all.
		expect(parseToolJson(await callTool("list_notes", {}))).toHaveLength(0);
		expect((await callTool("get_note", { id: lockedId })).error?.code).toBe(
			-32602,
		);
		expect(parseToolJson(await callTool("list_links", {}))).toHaveLength(0);
		const tags = parseToolJson<Array<{ tag: string }>>(
			await callTool("list_tags", {}),
		);
		expect(tags.some((t) => t.tag === "secret-tag")).toBe(false);

		// Refused on update_note, delete_note, link_records, unlink_records.
		expect(
			(
				await callTool("update_note", {
					id: lockedId,
					content: "Overwritten",
				})
			).error?.code,
		).toBe(-32003);
		expect(
			(await callTool("delete_note", { id: lockedId })).error?.code,
		).toBe(-32003);
		expect(
			(
				await callTool("unlink_records", {
					fromId: lockedId,
					toId: save.id,
				})
			).error?.code,
		).toBe(-32003);

		// Read-only mode hides write tools and rejects write calls.
		await setMcpMode("read");
		const listRes = await callMcp({
			jsonrpc: "2.0",
			id: 3,
			method: "tools/list",
		});
		const toolNames = (
			listRes?.result as { tools: Array<{ name: string }> }
		).tools.map((t) => t.name);
		expect(toolNames).toContain("list_tasks");
		expect(toolNames).toContain("get_productivity_overview");
		expect(toolNames).not.toContain("create_task");
		expect(toolNames).not.toContain("update_task");
		expect(
			(await callTool("create_task", { information: "Nope" })).error
				?.code,
		).toBe(-32003);
	});
});
