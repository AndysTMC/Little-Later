import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAI_PROVIDERS, LHOME_MAIN_CONTENT } from "little-shared/enums";
import { commands } from "../../src/background/commands";
import {
	createCommandContext,
	createDispatcher,
	createSerialQueue,
	type Dispatch,
} from "../../src/background/commands/registry";
import { createPageCapture } from "../../src/background/capture";
import { enforceChatRetention } from "../../src/background/chatRetention";
import { importProfileKeys } from "../../src/storage/keys";
import { getSettings, listChats } from "../../src/storage/repositories";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import { createMemorySessionStore } from "../../src/storage/session";
import {
	isUrlIgnored,
	normalizeIgnoredDomains,
} from "../../src/utils/ignoredUrls";
import { testAIConnection } from "../../src/services/ai/config";

describe("Milestone 3 — Settings, ignored URLs, chat retention & connection test", () => {
	let db: LittleDB;
	let dispatch: Dispatch;
	let session: ReturnType<typeof createMemorySessionStore>;
	let queue: ReturnType<typeof createSerialQueue>;

	beforeEach(async () => {
		db = openLittleDB(`little-m3-${crypto.randomUUID()}`);
		session = createMemorySessionStore();
		queue = createSerialQueue();
		dispatch = createDispatcher(
			commands,
			createCommandContext(db, session),
			queue,
		);
		const created = await dispatch("profile.create", {
			name: "Ada",
			password: null,
		});
		expect(created.ok).toBe(true);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		db.close();
		await db.delete();
	});

	it("matches ignored domains, subdomains, host+path rules, and full URL prefixes", () => {
		const rules = normalizeIgnoredDomains([
			"bank.example.com",
			"https://docs.internal.org/private/",
			"mail.google.com/mail/u/0",
		]);
		expect(isUrlIgnored("https://bank.example.com/login", rules)).toBe(
			true,
		);
		expect(
			isUrlIgnored("https://pay.bank.example.com/transfer", rules),
		).toBe(true);
		expect(isUrlIgnored("https://notbank.example.com", rules)).toBe(false);
		expect(
			isUrlIgnored("https://docs.internal.org/private/secret", rules),
		).toBe(true);
		expect(isUrlIgnored("https://docs.internal.org/public", rules)).toBe(
			false,
		);
		expect(
			isUrlIgnored("https://mail.google.com/mail/u/0/#inbox", rules),
		).toBe(true);
	});

	it("skips automatic history capture for ignored domains while still allowing explicit saves", async () => {
		const keys = await importProfileKeys((await session.get())!);
		const current = await getSettings(db, keys);
		const updated = await dispatch("settings.update", {
			misc: {
				...current.misc,
				ignoredDomains: ["private.bank.test"],
			},
		});
		expect(updated.ok).toBe(true);

		const capture = createPageCapture({
			db,
			session,
			queue,
			dispatch,
			now: Date.now,
			screenshot: async () => undefined,
			isShowing: async () => true,
		});

		await capture.visit({
			id: 1,
			windowId: 1,
			url: "https://sub.private.bank.test/account",
			title: "Bank",
		});
		expect(await db.saves.count()).toBe(0);

		const explicitResult = await capture.save({
			id: 1,
			windowId: 1,
			url: "https://sub.private.bank.test/account",
			title: "Bank",
		});
		expect(explicitResult).toBe("saved");
		expect(await db.saves.count()).toBe(1);
	});

	it("enforces chat retention on lock (-1) and age cutoff (7 days)", async () => {
		const keys = await importProfileKeys((await session.get())!);
		const current = await getSettings(db, keys);
		const chat1 = await dispatch("chat.create", { title: "Old chat" });
		expect(chat1.ok).toBe(true);
		const chatId = (chat1.ok ? chat1.value : null) as { id: string };
		// Age chat1 by 10 days.
		const tenDaysAgo = Date.now() - 10 * 86_400_000;
		await db.chats.update(chatId.id, { updatedAt: tenDaysAgo });
		await dispatch("chat.create", { title: "Fresh chat" });

		await dispatch("settings.update", {
			misc: { ...current.misc, chatRetentionDays: 7 },
		});
		const removedByAge = await enforceChatRetention(db, keys, {
			onLock: false,
		});
		expect(removedByAge).toBe(1);
		const remaining = await listChats(db, keys);
		expect(remaining).toHaveLength(1);
		expect(remaining[0]?.title).toBe("Fresh chat");

		await dispatch("settings.update", {
			misc: { ...current.misc, chatRetentionDays: -1 },
		});
		const removedOnLock = await enforceChatRetention(db, keys, {
			onLock: true,
		});
		expect(removedOnLock).toBe(1);
		expect(await listChats(db, keys)).toHaveLength(0);
	});

	it("persists Milestone 3 settings cleanly and keeps sparse defaults compact", async () => {
		const keys = await importProfileKeys((await session.get())!);
		const current = await getSettings(db, keys);
		const saved = await dispatch("settings.update", {
			ai: {
				...current.ai,
				instructions: "Prefer bullet points.",
				verbosity: "concise",
				mcpServerUrl: "http://127.0.0.1:3001/mcp",
			},
			misc: {
				...current.misc,
				defaultHomeTab: LHOME_MAIN_CONTENT.TASKS,
				backupReminderDays: 14,
				externalMcpMode: "read",
			},
		});
		expect(saved.ok).toBe(true);
		const next = await getSettings(db, keys);
		expect(next.ai.instructions).toBe("Prefer bullet points.");
		expect(next.ai.verbosity).toBe("concise");
		expect(next.ai.mcpServerUrl).toBe("http://127.0.0.1:3001/mcp");
		expect(next.misc.defaultHomeTab).toBe(LHOME_MAIN_CONTENT.TASKS);
		expect(next.misc.backupReminderDays).toBe(14);
		expect(next.misc.externalMcpMode).toBe("read");
	});

	it("reports actionable feedback from testAIConnection on success, 401, and 403", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: [{ id: "llama3.2" }, { id: "gemma4" }],
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			),
		);
		const ok = await testAIConnection({
			provider: LAI_PROVIDERS.OLLAMA,
			baseUrl: "",
			apiKey: "",
			model: "llama3.2",
		});
		expect(ok.ok).toBe(true);
		expect(ok.models).toEqual(["llama3.2", "gemma4"]);

		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response("Unauthorized", { status: 401 }),
		);
		const unauth = await testAIConnection({
			provider: LAI_PROVIDERS.CUSTOM,
			baseUrl: "https://api.example.com/v1",
			apiKey: "bad-key",
			model: "gpt-4o",
		});
		expect(unauth.ok).toBe(false);
		expect(unauth.message).toContain("401");

		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response("Forbidden", { status: 403 }),
		);
		const cors = await testAIConnection({
			provider: LAI_PROVIDERS.OLLAMA,
			baseUrl: "",
			apiKey: "",
			model: "llama3.2",
		});
		expect(cors.ok).toBe(false);
		expect(cors.message).toContain("OLLAMA_ORIGINS");
	});
});
