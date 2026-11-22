// @vitest-environment node
// Node, not jsdom: see tests/storage/profiles.test.ts.
import "fake-indexeddb/auto";
import { LAI_PROVIDERS } from "little-shared/enums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unlockedKeys } from "../../src/services/ai/records";
import * as runs from "../../src/services/ai/runs";
import { runStatusStore } from "../../src/services/ai/runStatus";
import { littleDB } from "../../src/storage/pageDB";
import { listChatMessages, listChats } from "../../src/storage/repositories";
import { send } from "../../src/utils/send";
import { readPage } from "../../src/services/ai/pages";
import { freshProfile } from "./profile";

// The page a message attaches, as the worker would read it from the tab.
vi.mock("../../src/services/ai/pages", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/services/ai/pages")>()),
	readPage: vi.fn(async () => ({
		title: "Bistro",
		url: "https://bistro.example/",
		selection: "",
		text: "Menu: tomato soup, 6 euros",
	})),
}));

// LittleAI's runs (decision 0017): a message is answered in the background
// and the answer stored in the chat; history carries over, even after the
// worker restarts; Stop and a lock end a run.

type Body = {
	messages: Array<{
		role: string;
		content: string | null;
		tool_call_id?: string;
	}>;
};
let requests: Array<Body>;
let urls: Array<string>;
type Reply = string | { tool: string; args: Record<string, unknown> };
let reply: (body: Body, signal: AbortSignal | undefined) => Promise<Reply>;

const completion = (answer: Reply) =>
	new Response(
		JSON.stringify({
			id: "chatcmpl-test",
			object: "chat.completion",
			created: 0,
			model: "m",
			choices: [
				{
					index: 0,
					message:
						typeof answer === "string"
							? { role: "assistant", content: answer }
							: {
									role: "assistant",
									content: null,
									tool_calls: [
										{
											id: "call-1",
											type: "function",
											function: {
												name: answer.tool,
												arguments: JSON.stringify(
													answer.args,
												),
											},
										},
									],
								},
					finish_reason:
						typeof answer === "string" ? "stop" : "tool_calls",
				},
			],
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);

beforeEach(async () => {
	await freshProfile();
	await send("settings.update", {
		ai: {
			provider: LAI_PROVIDERS.CUSTOM,
			baseUrl: "http://127.0.0.1:9/v1",
			apiKey: "",
			model: "m",
		},
	});
	requests = [];
	urls = [];
	reply = async () => "Hello from LittleAI";
	vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
		const body = JSON.parse(String(init?.body)) as Body;
		requests.push(body);
		urls.push(String(url));
		return completion(await reply(body, init?.signal ?? undefined));
	});
});

afterEach(() => vi.restoreAllMocks());

const messagesOf = async (chatId: string) =>
	(await listChatMessages(littleDB, await unlockedKeys(), chatId)).map(
		(message) =>
			message.role === "user"
				? `you: ${message.text}`
				: `ai: ${message.output.message}`,
	);

const settled = (chatId: string, count: number) =>
	vi.waitFor(async () => {
		expect(runs.isRunning(chatId)).toBe(false);
		expect(await runStatusStore.get(chatId)).toBeNull();
		expect(await messagesOf(chatId)).toHaveLength(count);
	});

// Resolves when the provider is asked, and waits for `release`.
const holdReply = () => {
	let release: (text: string) => void = () => {};
	const asked = new Promise<void>((resolve) => {
		reply = (_body, signal) =>
			new Promise<string>((done, fail) => {
				release = done;
				signal?.addEventListener("abort", () =>
					fail(new DOMException("Aborted", "AbortError")),
				);
				resolve();
			});
	});
	return { asked, release: (text: string) => release(text) };
};

describe("LittleAI runs", () => {
	it("answer in the background and store the exchange in a new chat", async () => {
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "What's due this week?",
		});
		await settled(chatId, 2);
		expect(await messagesOf(chatId)).toEqual([
			"you: What's due this week?",
			"ai: Hello from LittleAI",
		]);
		const [chat] = await listChats(littleDB, await unlockedKeys());
		expect(chat.title).toBe("What's due this week?");
	});

	it("continue a chat's history, also after the worker restarts", async () => {
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "My name is Ada.",
		});
		await settled(chatId, 2);
		// A restart loses the client; the stored chat brings it back.
		runs.forget(chatId);
		await send("ai.send", { chatId, text: "What is my name?" });
		await settled(chatId, 4);
		const sent = requests.at(-1)!.messages.map((m) => m.content ?? "");
		expect(
			sent.some((content) => content.includes("My name is Ada.")),
		).toBe(true);
		expect(
			sent.some((content) => content.includes("Hello from LittleAI")),
		).toBe(true);
	});

	it("send an attached page's text once, with the latest message", async () => {
		const page = {
			tabId: 7,
			title: "Bistro",
			url: "https://bistro.example/",
		};
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "What's on the menu?",
			page,
		});
		await settled(chatId, 2);
		await send("ai.send", { chatId, text: "And the prices?", page });
		await settled(chatId, 4);
		const sent = requests.at(-1)!.messages.map((m) => m.content ?? "");
		expect(sent.join("\n").match(/tomato soup/g)).toHaveLength(1);
		expect(sent.at(-1)).toContain("tomato soup");
		expect(
			sent.some((content) => content.startsWith("What's on the menu?")),
		).toBe(true);
	});

	it("ask the provider set up now, not the one the chat started with", async () => {
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "Hello",
		});
		await settled(chatId, 2);
		await send("settings.update", {
			ai: {
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: "http://127.0.0.1:10/v1",
				apiKey: "",
				model: "m",
			},
		});
		await send("ai.send", { chatId, text: "Hello again" });
		await settled(chatId, 4);
		expect(urls.map((url) => new URL(url).port)).toEqual(["9", "10"]);
	});

	it("replace a message and what followed in one step, or leave both", async () => {
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "Frist question",
		});
		await settled(chatId, 2);
		const [question] = await listChatMessages(
			littleDB,
			await unlockedKeys(),
			chatId,
		);
		// A replacement the worker refuses changes nothing.
		await expect(
			send("ai.send", {
				chatId,
				text: "x".repeat(100_001),
				replaceFromId: question.id,
			}),
		).rejects.toThrow(/text must be/);
		expect(await messagesOf(chatId)).toEqual([
			"you: Frist question",
			"ai: Hello from LittleAI",
		]);
		await send("ai.send", {
			chatId,
			text: "First question",
			replaceFromId: question.id,
		});
		await settled(chatId, 2);
		expect(await messagesOf(chatId)).toEqual([
			"you: First question",
			"ai: Hello from LittleAI",
		]);
		const [chat] = await listChats(littleDB, await unlockedKeys());
		expect(chat.title).toBe("First question");
	});

	it("shorten an answer too long to keep, saying so", async () => {
		reply = async () => "a".repeat(1_000_001);
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "Write forever",
		});
		await settled(chatId, 2);
		const [, answer] = await listChatMessages(
			littleDB,
			await unlockedKeys(),
			chatId,
		);
		const message =
			answer.role === "assistant" ? answer.output.message : "";
		expect(message.length).toBe(1_000_000);
		expect(message.endsWith("(The answer was shortened to fit.)")).toBe(
			true,
		);
	});

	it("say so when the model sends back nothing, not that it is done", async () => {
		reply = async () => "";
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "When is lunch?",
		});
		await settled(chatId, 2);
		const [, answer] = await messagesOf(chatId);
		expect(answer).toBe(
			"ai: The model sent back no answer. Try again, or try another model in AI settings.",
		);
	});

	it("store a run the worker lost as interrupted, with what it had done", async () => {
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "Tidy my notes",
		});
		await settled(chatId, 2);
		// What a run still going when the worker stopped leaves behind.
		await runStatusStore.set(chatId, {
			stage: "Running a tool",
			steps: ["Searched notes"],
			startedAt: Date.now(),
		});
		await runs.recoverInterrupted();
		expect(await runStatusStore.get(chatId)).toBeNull();
		const messages = await listChatMessages(
			littleDB,
			await unlockedKeys(),
			chatId,
		);
		expect(messages.at(-1)).toMatchObject({
			role: "assistant",
			output: {
				message: expect.stringMatching(/^Interrupted/),
				steps: ["Searched notes"],
			},
		});
	});

	it("say when an attached page was too long to read whole", async () => {
		vi.mocked(readPage).mockResolvedValueOnce({
			title: "Bistro",
			url: "https://bistro.example/",
			selection: "",
			text: "Menu: tomato soup…",
			shortened: true,
		});
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "Summarize this page",
			page: { tabId: 7, title: "Bistro", url: "https://bistro.example/" },
		});
		await settled(chatId, 2);
		const [, answer] = await listChatMessages(
			littleDB,
			await unlockedKeys(),
			chatId,
		);
		expect(answer).toMatchObject({
			role: "assistant",
			output: { steps: ["Read part of the page: it was too long"] },
		});
	});

	it("stop when asked, storing that they stopped", async () => {
		const held = holdReply();
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "Write a long story",
		});
		await held.asked;
		expect(await runStatusStore.get(chatId)).not.toBeNull();
		await expect(
			send("ai.send", { chatId, text: "And another" }),
		).rejects.toThrow(/still answering/);
		await send("ai.stop", { chatId });
		await settled(chatId, 2);
		expect((await messagesOf(chatId)).at(-1)).toBe("ai: Stopped.");
	});

	it("end on lock without writing anything after it", async () => {
		const held = holdReply();
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "Summarise my week",
		});
		await held.asked;
		const { profileId } = await unlockedKeys();
		await send("profile.lock", null);
		held.release("Too late");
		await vi.waitFor(() => expect(runs.isRunning(chatId)).toBe(false));
		await send("profile.unlock", { profileId, password: null });
		expect(await messagesOf(chatId)).toEqual(["you: Summarise my week"]);
	});

	it("cancel the provider request on lock, without waiting for its answer", async () => {
		let aborted = false;
		const asked = new Promise<void>((resolve) => {
			reply = (_body, signal) =>
				new Promise<string>((_done, fail) => {
					signal?.addEventListener("abort", () => {
						aborted = true;
						fail(new DOMException("Aborted", "AbortError"));
					});
					resolve();
				});
		});
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "Summarise my week",
		});
		await asked;
		await send("profile.lock", null);
		// The provider never answers; the lock alone ends the run.
		await vi.waitFor(() => {
			expect(aborted).toBe(true);
			expect(runs.isRunning(chatId)).toBe(false);
		});
	});

	it("refuse to confirm when nothing is waiting", async () => {
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "Hello",
		});
		await settled(chatId, 2);
		await send("ai.confirm", { chatId, password: null });
		await settled(chatId, 3);
		expect((await messagesOf(chatId)).at(-1)).toBe(
			"ai: Nothing is waiting for confirmation.",
		);
	});

	it("ask the user, ending the turn, and continue with their answer", async () => {
		reply = async () => ({
			tool: "ask_user",
			args: {
				question: "Which list should I use?",
				options: ["Work", "Home", "Work"],
			},
		});
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "Add milk to my list",
		});
		await settled(chatId, 2);
		const messages = await listChatMessages(
			littleDB,
			await unlockedKeys(),
			chatId,
		);
		const asked = messages[1];
		expect(asked.role === "assistant" && asked.output.question).toEqual({
			question: "Which list should I use?",
			options: ["Work", "Home"],
			allowOther: true,
		});
		// The answer continues the same conversation, with the question's
		// tool call answered, as providers require.
		reply = async () => "Added to Home.";
		await send("ai.send", { chatId, text: "Home" });
		await settled(chatId, 4);
		const sent = requests.at(-1)!.messages;
		expect(sent.some((message) => message.tool_call_id === "call-1")).toBe(
			true,
		);
		expect(sent.at(-1)?.content).toContain("Home");
	});

	it("stream the answer into the run's status as it is written", async () => {
		const pieces = ["Here ", "is your ", "week."];
		vi.mocked(globalThis.fetch).mockImplementation(async (_url, init) => {
			requests.push(JSON.parse(String(init?.body)) as Body);
			const encoder = new TextEncoder();
			const body = new ReadableStream<Uint8Array>({
				async start(controller) {
					for (const piece of pieces) {
						controller.enqueue(
							encoder.encode(
								`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`,
							),
						);
						await new Promise((resolve) =>
							setTimeout(resolve, 150),
						);
					}
					controller.enqueue(encoder.encode("data: [DONE]\n\n"));
					controller.close();
				},
			});
			return new Response(body, {
				headers: { "Content-Type": "text/event-stream" },
			});
		});
		const drafts: Array<string> = [];
		const unsubscribe = runStatusStore.subscribe((_chat, status) => {
			if (status?.draft) drafts.push(status.draft);
		});
		const { chatId } = await send("ai.send", {
			chatId: null,
			text: "My week?",
		});
		await settled(chatId, 2);
		unsubscribe();
		// The request asked to stream, and a part of the answer was shown
		// before the whole.
		expect((requests.at(-1) as Body & { stream?: boolean }).stream).toBe(
			true,
		);
		expect(drafts.some((draft) => draft !== "Here is your week.")).toBe(
			true,
		);
		expect((await messagesOf(chatId)).at(-1)).toBe(
			"ai: Here is your week.",
		);
	});
});

describe("a streamed completion", () => {
	it("pieces tool calls together by index", async () => {
		const { readCompletionStream } =
			await import("../../src/services/ai/main");
		const lines = [
			{
				choices: [
					{
						delta: {
							tool_calls: [
								{
									index: 0,
									id: "c1",
									function: {
										name: "search_",
										arguments: '{"que',
									},
								},
							],
						},
					},
				],
			},
			{
				choices: [
					{
						delta: {
							tool_calls: [
								{
									index: 0,
									function: {
										name: "notes",
										arguments: 'ry":"x"}',
									},
								},
							],
						},
						finish_reason: "tool_calls",
					},
				],
			},
		];
		const text =
			lines.map((line) => `data: ${JSON.stringify(line)}\n`).join("") +
			"data: [DONE]\n";
		const body = new Response(text).body!;
		const completion = await readCompletionStream(body, () => {});
		expect(completion.choices[0].message.tool_calls).toEqual([
			{
				id: "c1",
				type: "function",
				function: { name: "search_notes", arguments: '{"query":"x"}' },
			},
		]);
		expect(completion.choices[0].finish_reason).toBe("tool_calls");
	});
});
