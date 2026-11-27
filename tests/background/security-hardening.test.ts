// @vitest-environment node
import "fake-indexeddb/auto";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAI_PROVIDERS } from "little-shared/enums";
import { newKdfParams } from "little-shared/utils/envelope";
import { createPageCapture } from "../../src/background/capture";
import { commands } from "../../src/background/commands";
import {
	createCommandContext,
	createDispatcher,
	createSerialQueue,
	type Dispatch,
} from "../../src/background/commands/registry";
import { createBackup, importBackup } from "../../src/services/backup";
import {
	fetchProviderModels,
	testAIConnection,
} from "../../src/services/ai/config";
import {
	describePendingAction,
	LittleAI,
	sameConnection,
} from "../../src/services/ai/main";
import { callMcpTool, listMcpTools } from "../../src/services/ai/mcpClient";
import { currentOwner } from "../../src/services/ai/owner";
import { importProfileKeys } from "../../src/storage/keys";
import { littleDB } from "../../src/storage/pageDB";
import {
	getSettings,
	listChatMessages,
	listChats,
	listNotes,
} from "../../src/storage/repositories";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import {
	createMemorySessionStore,
	sessionStore,
	type SessionStore,
} from "../../src/storage/session";
import { createMemoryStaging, StagingError } from "../../src/storage/staging";
import {
	CLI_VERSION,
	OFFICIAL_EXTENSION_ID,
} from "../../packages/mcp-bridge/src/cli";
import {
	attachBridgeSocket,
	type PendingBridgeEntry,
} from "../../packages/mcp-bridge/src/nativeHost";
import mcpPkg from "../../packages/mcp-bridge/package.json";
import { send } from "../../src/utils/send";
import { freshProfile } from "../ai/profile";

const FAST_KDF = () => ({ ...newKdfParams(), iterations: 100 });

describe("security hardening — storage, commands, capture & MCP", () => {
	let db: LittleDB;
	let session: SessionStore;
	let queue: ReturnType<typeof createSerialQueue>;
	let dispatch: Dispatch;
	let clock: number;

	beforeEach(async () => {
		db = openLittleDB(`little-sec-${crypto.randomUUID()}`);
		await db.open();
		session = createMemorySessionStore();
		queue = createSerialQueue();
		clock = Date.UTC(2026, 10, 27, 12, 0, 0);
		dispatch = createDispatcher(
			commands,
			createCommandContext(db, session, () => clock),
			queue,
		);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		db.close();
		await db.delete();
	});

	it("seals sensitive staged blobs so plaintext never touches staging storage and cross-profile reads fail", async () => {
		const createdA = await dispatch("profile.create", {
			name: "Alice",
			password: null,
		});
		expect(createdA.ok).toBe(true);
		const keysA = await importProfileKeys((await session.get())!);

		const createdB = await dispatch("profile.create", {
			name: "Bob",
			password: null,
		});
		expect(createdB.ok).toBe(true);
		const keysB = await importProfileKeys((await session.get())!);

		const store = createMemoryStaging(() => clock);
		const secretText = "PRIVATE-BOOKMARK-EXPORT-SECRET-7712";
		const stagedName = await store.putBlob(
			new Blob([secretText], { type: "text/html" }),
			keysA,
		);

		// Raw staged bytes must not contain the plaintext.
		const rawBytes = await store.read(stagedName);
		expect(new TextDecoder().decode(rawBytes)).not.toContain(secretText);

		// Matching profile keys decrypt cleanly.
		const opened = await store.readBlob(stagedName, keysA);
		expect(await opened.text()).toBe(secretText);

		// Another profile's keys are rejected.
		await expect(store.readBlob(stagedName, keysB)).rejects.toThrow(
			StagingError,
		);
	});

	it("requires fresh profile password to update, unlock, or delete a locked note", async () => {
		const pw = "VaultPass#2026";
		const created = await dispatch("profile.create", {
			name: "Ada",
			password: pw,
		});
		expect(created.ok).toBe(true);

		const made = await dispatch("note.create", {
			content: "Top secret recovery keys",
			locked: true,
			title: "Vault keys",
		});
		expect(made.ok).toBe(true);
		const noteId = (made.ok ? (made.value as { id: string }).id : "")!;

		// Update without password is rejected.
		const noPwUpdate = await dispatch("note.update", {
			id: noteId,
			content: "Tampered",
			locked: false,
		});
		expect(noPwUpdate.ok).toBe(false);

		// Update with wrong password is rejected.
		const wrongPwUpdate = await dispatch("note.update", {
			id: noteId,
			content: "Tampered",
			password: "WrongPassword",
		});
		expect(wrongPwUpdate.ok).toBe(false);

		// Delete without password or with wrong password is rejected.
		expect((await dispatch("note.delete", { id: noteId })).ok).toBe(false);
		expect(
			(
				await dispatch("note.delete", {
					id: noteId,
					password: "WrongPassword",
				})
			).ok,
		).toBe(false);

		// Correct password allows update and delete.
		const okUpdate = await dispatch("note.update", {
			id: noteId,
			content: "Updated secret",
			password: pw,
		});
		expect(okUpdate.ok).toBe(true);
		const keys = await importProfileKeys((await session.get())!);
		const [updatedNote] = await listNotes(db, keys);
		expect(updatedNote?.content).toBe("Updated secret");
		expect(updatedNote?.locked).toBe(true);

		const okDelete = await dispatch("note.delete", {
			id: noteId,
			password: pw,
		});
		expect(okDelete.ok).toBe(true);
		expect(await listNotes(db, keys)).toHaveLength(0);
	});

	it("enforces 'When profile locks' chat retention on profile.unlock after a browser restart", async () => {
		const pw = "RestartPass#1";
		const created = await dispatch("profile.create", {
			name: "Ada",
			password: pw,
		});
		expect(created.ok).toBe(true);
		const profileId = (
			created.ok ? (created.value as { profileId: string }).profileId : ""
		)!;
		const keys = await importProfileKeys((await session.get())!);
		const settings = await getSettings(db, keys);
		await dispatch("settings.update", {
			misc: { ...settings.misc, chatRetentionDays: -1 },
		});
		const chat = await dispatch("chat.create", { title: "Ephemeral chat" });
		expect(chat.ok).toBe(true);
		expect(await listChats(db, keys)).toHaveLength(1);

		// Simulate Chrome restart: session disappears without profile.lock firing.
		await session.clear();

		// Unlocking immediately enforces retention on leftover prior-session chats.
		const unlocked = await dispatch("profile.unlock", {
			profileId,
			password: pw,
		});
		expect(unlocked.ok).toBe(true);
		const nextKeys = await importProfileKeys((await session.get())!);
		expect(await listChats(db, nextKeys)).toHaveLength(0);
	});

	it("fails closed on automatic visit capture when settings cannot be decrypted", async () => {
		const created = await dispatch("profile.create", {
			name: "Ada",
			password: null,
		});
		expect(created.ok).toBe(true);
		const keys = await importProfileKeys((await session.get())!);
		// Seed a corrupted settings row so getSettings throws.
		await db.settings.put({
			id: keys.profileId,
			profileId: keys.profileId,
			keyId: keys.current.keyId,
			body: new Uint8Array([1, 2, 3, 4]),
			createdAt: clock,
			updatedAt: clock,
		});

		const capture = createPageCapture({
			db,
			session,
			queue,
			dispatch,
			now: () => clock,
			screenshot: async () => new Uint8Array([0xff, 0xd8]),
			isShowing: async () => true,
		});

		await capture.visit({
			id: 1,
			windowId: 1,
			url: "https://sensitive.bank.example/account",
			title: "Bank",
		});
		expect(await db.saves.count()).toBe(0);
	});

	it("uses the signed release extension ID and package.json CLI version", () => {
		expect(OFFICIAL_EXTENSION_ID).toBe("jbmjjboeppfcjblnbiiaicoakpabghom");
		expect(CLI_VERSION).toBe(mcpPkg.version);
	});

	it("rejects oversized socket lines and excessive concurrent pending requests in nativeHost", () => {
		class MockSocket extends EventEmitter {
			destroyed = false;
			written: Array<string> = [];
			write(chunk: string) {
				this.written.push(chunk);
				return true;
			}
			end(chunk?: string) {
				if (chunk) this.written.push(chunk);
				this.destroyed = true;
				return this;
			}
			destroy() {
				this.destroyed = true;
				this.emit("close");
				return this;
			}
		}

		// 1. Oversized line rejected with -32600 and socket destroyed.
		const pending1 = new Map<string, PendingBridgeEntry>();
		const forwarded1: Array<unknown> = [];
		const sock1 = new MockSocket();
		attachBridgeSocket(sock1 as unknown as Socket, {
			pending: pending1,
			writeToChrome: (payload) => forwarded1.push(payload),
			maxLineBytes: 64,
			maxConcurrentPending: 4,
			requestTimeoutMs: 5_000,
		});
		sock1.emit("data", Buffer.from("x".repeat(100), "utf8"));
		expect(sock1.destroyed).toBe(true);
		expect(forwarded1).toHaveLength(0);
		expect(JSON.parse(sock1.written[0]!)).toMatchObject({
			error: { code: -32600 },
		});

		// 2. Concurrency limit rejected with -32003.
		const pending2 = new Map<string, PendingBridgeEntry>();
		const forwarded2: Array<unknown> = [];
		const sock2 = new MockSocket();
		attachBridgeSocket(sock2 as unknown as Socket, {
			pending: pending2,
			writeToChrome: (payload) => forwarded2.push(payload),
			maxLineBytes: 1024,
			maxConcurrentPending: 2,
			requestTimeoutMs: 5_000,
		});
		sock2.emit(
			"data",
			Buffer.from(
				[
					JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
					JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
					JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" }),
				].join("\n") + "\n",
				"utf8",
			),
		);
		expect(forwarded2).toHaveLength(2);
		expect(pending2.size).toBe(2);
		expect(sock2.written).toHaveLength(1);
		expect(JSON.parse(sock2.written[0]!)).toMatchObject({
			id: 3,
			error: { code: -32003 },
		});
		sock2.destroy();
		expect(pending2.size).toBe(0);
	});
});

describe("security hardening — backup locked-note gate & AI/MCP redirect + approval guards", () => {
	afterEach(async () => {
		vi.restoreAllMocks();
		await sessionStore.clear();
	});

	it("requires current profile password to create an encrypted backup when locked notes exist", async () => {
		const profilePw = "ProfilePass#42";
		await littleDB.open();
		await sessionStore.clear();
		await send("profile.create", { name: "Ada", password: profilePw });

		// Without locked notes, backup succeeds without profilePassword.
		const plainBackup = await createBackup("BackupPass#1", FAST_KDF());
		expect(plainBackup.size).toBeGreaterThan(0);

		// Add a locked note.
		await send("note.create", {
			content: "Secret note body",
			locked: true,
			title: "Secrets",
		});

		// Without profilePassword, backup is rejected.
		await expect(createBackup("BackupPass#2", FAST_KDF())).rejects.toThrow(
			/locked notes/i,
		);

		// With wrong profilePassword, backup is rejected.
		await expect(
			createBackup("BackupPass#2", FAST_KDF(), undefined, {
				profilePassword: "WrongPassword",
			}),
		).rejects.toThrow(/wrong/i);

		// With correct profilePassword, backup succeeds.
		const lockedBackup = await createBackup(
			"BackupPass#2",
			FAST_KDF(),
			undefined,
			{ profilePassword: profilePw },
		);
		expect(lockedBackup.size).toBeGreaterThan(0);
	});

	it("passes redirect: 'error' on outbound MCP & AI fetches and shows origin + args in MCP approval", async () => {
		await freshProfile();
		await send("settings.update", {
			ai: {
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: "https://api.example.test/v1",
				apiKey: "sk-test",
				model: "gpt-test",
				mcpServerUrl: "http://127.0.0.1:3001/mcp",
			},
		});

		const fetchCalls: Array<RequestInit | undefined> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
			fetchCalls.push(init);
			return new Response(
				JSON.stringify({
					jsonrpc: "2.0",
					id: "1",
					result: {
						tools: [],
						content: [{ type: "text", text: "ok" }],
					},
					data: [{ id: "gpt-test" }],
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: "Hi" },
							finish_reason: "stop",
						},
					],
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		});

		await listMcpTools("http://127.0.0.1:3001/mcp");
		await callMcpTool("http://127.0.0.1:3001/mcp", "ping", { q: 1 });
		await fetchProviderModels({
			provider: LAI_PROVIDERS.CUSTOM,
			baseUrl: "https://api.example.test/v1",
			apiKey: "sk-test",
		});
		await testAIConnection({
			provider: LAI_PROVIDERS.CUSTOM,
			baseUrl: "https://api.example.test/v1",
			apiKey: "sk-test",
			model: "gpt-test",
		});
		const owner = await currentOwner();
		const ai = await LittleAI.getLAIAssistInstance(owner);
		await ai.prompt("hello");

		expect(fetchCalls.length).toBeGreaterThanOrEqual(5);
		for (const call of fetchCalls) {
			expect(call?.redirect).toBe("error");
		}

		const summary = await describePendingAction(
			owner,
			"mcp__read_file",
			{
				path: "/etc/hosts",
				limit: 10,
			},
			{ mcpServerUrl: "http://127.0.0.1:4009/mcp" },
		);
		expect(summary).toContain('Run local MCP tool "read_file"');
		expect(summary).toContain("http://127.0.0.1:4009");
		expect(summary).toContain("/etc/hosts");

		// Connection equality includes mcpServerUrl so edits expire pending approvals.
		const connA = await LittleAI.connectionOf(owner);
		expect(
			sameConnection(connA, {
				...connA,
				mcpServerUrl: "http://127.0.0.1:4009/mcp",
			}),
		).toBe(false);
	});

	it("preserves profile unlock when chat retention cleanup fails while gating chat history reads", async () => {
		const db = openLittleDB(`little-unlock-gate-${crypto.randomUUID()}`);
		await db.open();
		const session = createMemorySessionStore();
		const clock = Date.UTC(2026, 10, 27, 12, 0, 0);
		const dispatch = createDispatcher(
			commands,
			createCommandContext(db, session, () => clock),
			createSerialQueue(),
		);
		try {
			const created = await dispatch("profile.create", {
				name: "Ada",
				password: "VaultPassword#1",
			});
			expect(created.ok).toBe(true);
			const profileId = (
				created.ok
					? (created.value as { profileId: string }).profileId
					: ""
			)!;
			await dispatch("chat.create", { title: "Prior chat" });
			await dispatch("note.create", { content: "Regular note" });
			await dispatch("profile.lock", null);

			// Corrupt the settings row so retention cleanup throws during unlock.
			await db.settings.put({
				id: profileId,
				profileId,
				keyId: 1,
				body: new Uint8Array([1, 2, 3, 4]),
				createdAt: clock,
				updatedAt: clock,
			});

			// Unlock still succeeds for the rest of the profile, with chatHistoryBlocked set.
			const unlocked = await dispatch("profile.unlock", {
				profileId,
				password: "VaultPassword#1",
			});
			expect(unlocked.ok).toBe(true);
			const current = await session.get();
			expect(current?.chatHistoryBlocked).toBe(true);
			const keys = await importProfileKeys(current!);
			// Notes remain accessible, while chat history is gated.
			expect(await listNotes(db, keys)).toHaveLength(1);
			expect(await listChats(db, keys)).toEqual([]);
		} finally {
			db.close();
			await db.delete();
		}
	});

	it("omits chat history from backup snapshots while chatHistoryBlocked is set", async () => {
		await littleDB.open();
		await sessionStore.clear();
		await send("profile.create", {
			name: "Ada",
			password: null,
		});
		const createdChat = await send("chat.create", {
			title: "Expired chat",
		});
		await send("chat.addMessage", {
			chatId: createdChat.id,
			message: { role: "user", text: "Sensitive expired message" },
		});
		await send("note.create", { content: "Keep this note" });

		// Simulate a retention-deletion failure with readable settings on unlock.
		const sessionData = await sessionStore.get();
		expect(sessionData).not.toBeNull();
		await sessionStore.set({
			...sessionData!,
			chatHistoryBlocked: true,
		});

		const backup = await createBackup("BackupPass#9", FAST_KDF());
		const beforeIds = new Set(
			(await littleDB.profiles.toArray()).map((profile) => profile.id),
		);
		await send("profile.lock", null);
		await importBackup(backup, "BackupPass#9");

		const profiles = await littleDB.profiles.toArray();
		const restoredProfile = profiles.find(
			(profile) => !beforeIds.has(profile.id),
		);
		expect(restoredProfile).toBeDefined();
		await send("profile.unlock", {
			profileId: restoredProfile!.id,
			password: "BackupPass#9",
		});
		const restoredSession = await sessionStore.get();
		expect(restoredSession?.profileId).toBe(restoredProfile!.id);
		expect(restoredSession?.chatHistoryBlocked).toBeUndefined();
		const restoredKeys = await importProfileKeys(restoredSession!);

		expect(await listNotes(littleDB, restoredKeys)).toHaveLength(1);
		expect(await listChats(littleDB, restoredKeys)).toEqual([]);
		expect(
			await listChatMessages(littleDB, restoredKeys, createdChat.id),
		).toEqual([]);
	});
});
