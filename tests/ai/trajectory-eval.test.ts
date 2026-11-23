import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAI_PROVIDERS } from "little-shared/enums";
import { commands } from "../../src/background/commands";
import {
	createCommandContext,
	createDispatcher,
	createSerialQueue,
	type Dispatch,
} from "../../src/background/commands/registry";
import { handleExternalMcpRequest } from "../../src/background/mcpBridge";
import { OpenAICompatibleAI } from "../../src/services/ai/main";
import type { AIOwner } from "../../src/services/ai/owner";
import { validateLoopbackMcpUrl } from "../../src/services/ai/mcpClient";
import {
	hybridRank,
	rrfFuse,
} from "../../src/services/ai/toolCalls/_utils/bm25";
import {
	toolRegistry,
	toolRequiresConfirmation,
} from "../../src/services/ai/toolRegistry";
import { importProfileKeys } from "../../src/storage/keys";
import { littleDB } from "../../src/storage/pageDB";
import {
	getSettings,
	listNotes,
	listTasks,
} from "../../src/storage/repositories";
import { sessionStore, toBase64 } from "../../src/storage/session";
import { setLocalDispatch } from "../../src/utils/send";

const TINY_PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
	0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
	0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
	0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
	0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe("Milestone 4 — Agent trajectory evals, hybrid retrieval & MCP security", () => {
	let dispatch: Dispatch;
	let owner: AIOwner;
	let profileId: string;

	beforeEach(async () => {
		await littleDB.delete();
		await littleDB.open();
		await sessionStore.clear();
		dispatch = createDispatcher(
			commands,
			createCommandContext(littleDB, sessionStore),
			createSerialQueue(),
		);
		setLocalDispatch(dispatch);
		const created = await dispatch("profile.create", {
			name: "Ada",
			password: "VaultPassword#1",
		});
		expect(created.ok).toBe(true);
		profileId = ((created.ok ? created.value : null) as { id: string }).id;
		const session = (await sessionStore.get())!;
		const keys = await importProfileKeys(session);
		owner = {
			profileId,
			unlockId: session.unlockId,
			keys: async () => keys,
			assertCurrent: async () => undefined,
			send: async (name, input) => {
				const res = await dispatch(name, input, { profileId });
				if (!res.ok) throw new Error(res.error.message);
				return res.value as never;
			},
		};
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await sessionStore.clear();
		await littleDB.delete();
	});

	it("ranks relevant records highest with BM25 + trigrams + RRF fusion", () => {
		const docs = [
			{ id: "1", text: "Weekly grocery shopping list milk eggs" },
			{ id: "2", text: "Kubernetes deployment rollback playbook prod" },
			{
				id: "3",
				text: "Production deployment checklist and canary notes",
			},
		];
		const ranked = hybridRank(docs, "kubernetes rollback", (d) => d.text);
		expect(ranked[0]?.item.id).toBe("2");

		// Typo tolerance via trigrams.
		const fuzzy = hybridRank(docs, "kubernets deploymnt", (d) => d.text);
		expect(fuzzy[0]?.item.id).toBe("2");

		const fused = rrfFuse([
			["2", "3"],
			["3", "2", "1"],
		]);
		expect(fused[0]).toBe("2");
		expect(fused).toContain("3");
	});

	it("executes federated search_all & search_images while strictly excluding locked notes", async () => {
		await dispatch("note.create", {
			title: "Public roadmap",
			content: "Launch Q4 milestone",
			tags: ["work"],
		});
		await dispatch("note.create", {
			title: "Secret vault note",
			content: "TopSecretPasswordPhrase launch Q4",
			locked: true,
			tags: ["work"],
		});
		await dispatch("image.create", {
			bytesBase64: toBase64(TINY_PNG),
			mimeType: "image/png",
			title: "Q4 Architecture Diagram",
			tags: ["work"],
		});

		const searchAll = toolRegistry.get("search_all")!;
		const res = await searchAll.execute(
			searchAll.normalizeArgs({ query: "Q4", tag: "work" }),
			{ ai: { getStructuredResponse: async () => ({ ids: [] }) }, owner },
		);
		const payload = res.modelPayload as {
			notes: Array<{ content: string }>;
			images: Array<{ title: string }>;
		};
		expect(payload.notes).toHaveLength(1);
		expect(payload.notes[0]?.content).toContain("Launch Q4");
		expect(JSON.stringify(payload)).not.toContain(
			"TopSecretPasswordPhrase",
		);
		expect(payload.images).toHaveLength(1);
		expect(payload.images[0]?.title).toBe("Q4 Architecture Diagram");
	});

	it("gates recurring create_task, link_records, remember_fact, and local MCP calls behind confirmation", async () => {
		expect(toolRequiresConfirmation("create_task")).toBe(true);
		expect(toolRequiresConfirmation("link_records")).toBe(true);
		expect(toolRequiresConfirmation("unlink_records")).toBe(true);
		expect(toolRequiresConfirmation("remember_fact")).toBe(true);
		expect(toolRequiresConfirmation("forget_fact")).toBe(true);
		expect(toolRequiresConfirmation("search_all")).toBe(false);
		expect(toolRequiresConfirmation("search_images")).toBe(false);
		expect(toolRequiresConfirmation("read_open_tabs")).toBe(false);

		const ai = new OpenAICompatibleAI({
			model: "test-model",
			provider: LAI_PROVIDERS.OLLAMA,
			apiKey: "",
			baseUrl: "http://127.0.0.1:11434/v1",
			owner,
		});

		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					id: "c1",
					object: "chat.completion",
					created: 1,
					model: "test-model",
					choices: [
						{
							index: 0,
							finish_reason: "tool_calls",
							message: {
								role: "assistant",
								content: null,
								tool_calls: [
									{
										id: "call-1",
										type: "function",
										function: {
											name: "create_task",
											arguments: JSON.stringify({
												information:
													"Weekly standup prep",
												label: "Standup",
												recurrence: {
													freq: "weekly",
													time: "09:30",
													byWeekday: [1],
												},
												tags: ["team"],
											}),
										},
									},
									{
										id: "call-2",
										type: "function",
										function: {
											name: "remember_fact",
											arguments: JSON.stringify({
												text: "User prefers concise Monday summaries.",
											}),
										},
									},
								],
							},
						},
					],
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			),
		);

		const pending = await ai.prompt(
			"Create weekly standup and remember my preference",
		);
		expect(pending.confirmation?.items).toHaveLength(2);
		expect(pending.confirmation?.items[0]?.summary).toContain("repeats:");
		expect(pending.confirmation?.items[1]?.summary).toContain(
			"Little AI memories",
		);

		// Nothing persisted before confirmation.
		const keys = await owner.keys();
		expect(await listTasks(littleDB, keys)).toHaveLength(0);
		expect(
			(await getSettings(littleDB, keys)).ai.memories ?? [],
		).toHaveLength(0);

		const confirmed = await ai.confirmPendingMutations();
		expect(confirmed.message).toContain('Created task "Standup"');
		expect(confirmed.message).toContain("Remembered:");

		const tasks = await listTasks(littleDB, keys);
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.schedule.kind).toBe("recurring");
		expect(tasks[0]?.tags).toEqual(["team"]);
		expect((await getSettings(littleDB, keys)).ai.memories).toHaveLength(1);
	});

	it("enforces loopback-only guard on local MCP client URLs", () => {
		expect(validateLoopbackMcpUrl("http://127.0.0.1:3001/mcp")).toBe(
			"http://127.0.0.1:3001/mcp",
		);
		expect(validateLoopbackMcpUrl("http://localhost:8080/mcp")).toBe(
			"http://localhost:8080/mcp",
		);
		expect(() =>
			validateLoopbackMcpUrl("https://evil.example.com/mcp"),
		).toThrow();
		expect(() => validateLoopbackMcpUrl("file:///etc/passwd")).toThrow();
	});

	it("enforces external MCP bridge permissions (off / read / write / locked) and hides locked notes", async () => {
		await dispatch("note.create", {
			title: "Visible note",
			content: "Public hello",
		});
		await dispatch("note.create", {
			title: "Locked diary",
			content: "NEVER_EXPOSE_THIS",
			locked: true,
		});

		// MCP handshake: initialize negotiates protocolVersion, notifications
		// return null (no JSON-RPC response).
		const initRes = await handleExternalMcpRequest({
			db: littleDB,
			session: sessionStore,
			dispatch,
			request: {
				id: 0,
				method: "initialize",
				params: { protocolVersion: "2025-03-26" },
			},
		});
		expect(
			(initRes?.result as { protocolVersion?: string })?.protocolVersion,
		).toBe("2025-03-26");
		const notifRes = await handleExternalMcpRequest({
			db: littleDB,
			session: sessionStore,
			dispatch,
			request: { method: "notifications/initialized" },
		});
		expect(notifRes).toBeNull();

		// Default mode is "off".
		const blocked = await handleExternalMcpRequest({
			db: littleDB,
			session: sessionStore,
			dispatch,
			request: { id: 1, method: "tools/list" },
		});
		expect(blocked?.error?.code).toBe(-32003);

		// Enable "read" mode.
		const keys = await owner.keys();
		const current = await getSettings(littleDB, keys);
		await dispatch("settings.update", {
			misc: { ...current.misc, externalMcpMode: "read" },
		});

		const readTools = await handleExternalMcpRequest({
			db: littleDB,
			session: sessionStore,
			dispatch,
			request: { id: 2, method: "tools/list" },
		});
		const toolNames = (
			readTools?.result as { tools: Array<{ name: string }> }
		).tools.map((t) => t.name);
		expect(toolNames).toContain("list_notes");
		expect(toolNames).not.toContain("create_note");

		// Read notes excludes locked note.
		const notesRes = await handleExternalMcpRequest({
			db: littleDB,
			session: sessionStore,
			dispatch,
			request: {
				id: 3,
				method: "tools/call",
				params: { name: "list_notes", arguments: {} },
			},
		});
		const serialized = JSON.stringify(notesRes?.result);
		expect(serialized).toContain("Public hello");
		expect(serialized).not.toContain("NEVER_EXPOSE_THIS");

		// Write tool rejected in read-only mode.
		const deniedWrite = await handleExternalMcpRequest({
			db: littleDB,
			session: sessionStore,
			dispatch,
			request: {
				id: 4,
				method: "tools/call",
				params: {
					name: "create_note",
					arguments: { content: "From external agent" },
				},
			},
		});
		expect(deniedWrite?.error?.code).toBe(-32003);

		// Switch to "write" mode -> write succeeds via dispatcher.
		await dispatch("settings.update", {
			misc: { ...current.misc, externalMcpMode: "write" },
		});
		const createdRes = await handleExternalMcpRequest({
			db: littleDB,
			session: sessionStore,
			dispatch,
			request: {
				id: 5,
				method: "tools/call",
				params: {
					name: "create_note",
					arguments: { content: "Created by external MCP" },
				},
			},
		});
		expect(createdRes?.error).toBeUndefined();
		const allNotes = await listNotes(littleDB, keys);
		expect(
			allNotes.some((note) => note.content === "Created by external MCP"),
		).toBe(true);

		// Locking profile immediately blocks MCP access.
		await sessionStore.clear();
		const whileLocked = await handleExternalMcpRequest({
			db: littleDB,
			session: sessionStore,
			dispatch,
			request: { id: 6, method: "tools/list" },
		});
		expect(whileLocked?.error?.code).toBe(-32001);
	});
});
