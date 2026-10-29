import { test, expect, Page } from "@playwright/test";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";

type MockProviderServer = {
	baseUrl: string;
	close: () => Promise<void>;
	getInitialPromptCount: (prompt: string) => number;
	resetCounts: () => void;
};

type ChatMessage = {
	role?: string;
	content?: string | null;
	tool_calls?: Array<{
		id: string;
		type: "function";
		function: {
			name: string;
			arguments: string;
		};
	}>;
};

const readBody = async (req: IncomingMessage): Promise<string> => {
	let body = "";
	for await (const chunk of req) {
		body += chunk;
	}
	return body;
};

const setCorsHeaders = (res: ServerResponse): void => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
};

const sendJSON = (
	res: ServerResponse,
	statusCode: number,
	payload: unknown,
): void => {
	res.statusCode = statusCode;
	setCorsHeaders(res);
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify(payload));
};

const completionPayload = (
	message:
		| {
				role: "assistant";
				content: string | null;
				tool_calls?: Array<unknown>;
		  }
		| {
				role: "assistant";
				content: string;
		  },
	finishReason: "stop" | "tool_calls" = "stop",
) => ({
	id: "chatcmpl-mock",
	object: "chat.completion",
	created: Math.floor(Date.now() / 1000),
	model: "mock-model",
	choices: [
		{
			index: 0,
			message,
			finish_reason: finishReason,
		},
	],
});

const getLastMessage = (
	messages: Array<ChatMessage>,
): ChatMessage | undefined => messages.at(-1);

const getTrailingToolMessages = (
	messages: Array<ChatMessage>,
): Array<ChatMessage> => {
	const result: Array<ChatMessage> = [];
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i]?.role !== "tool") {
			break;
		}
		result.unshift(messages[i]);
	}
	return result;
};

const parseToolMessageContent = (
	value: string | null | undefined,
): { message?: string; payload?: Record<string, unknown> } | null => {
	if (!value || typeof value !== "string") {
		return null;
	}
	try {
		const parsed = JSON.parse(value) as {
			message?: unknown;
			payload?: unknown;
		};
		const message =
			typeof parsed.message === "string" ? parsed.message : undefined;
		const payload =
			parsed.payload &&
			typeof parsed.payload === "object" &&
			!Array.isArray(parsed.payload)
				? (parsed.payload as Record<string, unknown>)
				: undefined;
		return { message, payload };
	} catch {
		return null;
	}
};

const normalizePrompt = (value: string): string =>
	value.trim().toLowerCase().replace(/\s+/g, " ");

const createMockProviderServer = async (): Promise<MockProviderServer> => {
	const initialPromptCount = new Map<string, number>();

	const server = createServer(async (req, res) => {
		setCorsHeaders(res);
		if (req.method === "OPTIONS") {
			res.statusCode = 204;
			res.end();
			return;
		}

		if (req.url === "/v1/models" && req.method === "GET") {
			sendJSON(res, 200, {
				object: "list",
				data: [{ id: "mock-model", object: "model" }],
			});
			return;
		}

		if (req.url === "/v1/chat/completions" && req.method === "POST") {
			const bodyText = await readBody(req);
			let body: Record<string, unknown>;
			try {
				body = JSON.parse(bodyText) as Record<string, unknown>;
			} catch {
				sendJSON(res, 400, { error: "invalid_json" });
				return;
			}

			const messages = Array.isArray(body.messages)
				? (body.messages as Array<ChatMessage>)
				: [];
			const lastMessage = getLastMessage(messages);

			if (body.response_format) {
				sendJSON(
					res,
					200,
					completionPayload({
						role: "assistant",
						content: JSON.stringify({ ids: [] }),
					}),
				);
				return;
			}

			if (lastMessage?.role === "user") {
				const userText = String(lastMessage.content ?? "");
				const normalized = normalizePrompt(userText);
				initialPromptCount.set(
					normalized,
					(initialPromptCount.get(normalized) ?? 0) + 1,
				);

				if (normalized.includes("simple ping")) {
					sendJSON(
						res,
						200,
						completionPayload({
							role: "assistant",
							content: "Pong from mock provider.",
						}),
					);
					return;
				}

				if (normalized.includes("show productivity dashboard")) {
					sendJSON(
						res,
						200,
						completionPayload(
							{
								role: "assistant",
								content: null,
								tool_calls: [
									{
										id: "call_overview",
										type: "function",
										function: {
											name: "get_productivity_overview",
											arguments: "{}",
										},
									},
									{
										id: "call_recent_history",
										type: "function",
										function: {
											name: "get_recent_history",
											arguments: JSON.stringify({
												limit: 5,
											}),
										},
									},
								],
							},
							"tool_calls",
						),
					);
					return;
				}

				if (normalized.includes("find project notes")) {
					sendJSON(
						res,
						200,
						completionPayload(
							{
								role: "assistant",
								content: null,
								tool_calls: [
									{
										id: "call_notes",
										type: "function",
										function: {
											name: "search_notes",
											arguments: JSON.stringify({
												query: "project phoenix",
											}),
										},
									},
								],
							},
							"tool_calls",
						),
					);
					return;
				}

				if (normalized.includes("show reminders for april fifth")) {
					sendJSON(
						res,
						200,
						completionPayload(
							{
								role: "assistant",
								content: null,
								tool_calls: [
									{
										id: "call_reminders",
										type: "function",
										function: {
											name: "search_reminders",
											arguments: JSON.stringify({
												query: "standup",
												targetDate:
													"2026-04-05T00:00:00+05:30",
												targetDateCriteria: {
													year: true,
													month: true,
													day: true,
												},
											}),
										},
									},
								],
							},
							"tool_calls",
						),
					);
					return;
				}

				if (normalized.includes("list high priority tasks")) {
					sendJSON(
						res,
						200,
						completionPayload(
							{
								role: "assistant",
								content: null,
								tool_calls: [
									{
										id: "call_tasks",
										type: "function",
										function: {
											name: "search_tasks",
											arguments: JSON.stringify({
												priority: "high",
											}),
										},
									},
								],
							},
							"tool_calls",
						),
					);
					return;
				}

				if (normalized.includes("show hotstar preview")) {
					sendJSON(
						res,
						200,
						completionPayload(
							{
								role: "assistant",
								content: null,
								tool_calls: [
									{
										id: "call_preview",
										type: "function",
										function: {
											name: "get_save_preview_image",
											arguments: JSON.stringify({
												query: "hotstar",
											}),
										},
									},
								],
							},
							"tool_calls",
						),
					);
					return;
				}

				if (normalized.includes("add grocery note")) {
					sendJSON(
						res,
						200,
						completionPayload(
							{
								role: "assistant",
								content: null,
								tool_calls: [
									{
										id: "call_create_note",
										type: "function",
										function: {
											name: "create_note",
											arguments: JSON.stringify({
												content:
													"Groceries for Monday: milk, bread",
											}),
										},
									},
								],
							},
							"tool_calls",
						),
					);
					return;
				}

				if (normalized.includes("find grocery notes")) {
					sendJSON(
						res,
						200,
						completionPayload(
							{
								role: "assistant",
								content: null,
								tool_calls: [
									{
										id: "call_find_grocery_notes",
										type: "function",
										function: {
											name: "search_notes",
											arguments: JSON.stringify({
												query: "groceries",
											}),
										},
									},
								],
							},
							"tool_calls",
						),
					);
					return;
				}

				sendJSON(
					res,
					200,
					completionPayload({
						role: "assistant",
						content: "Mock provider fallback response.",
					}),
				);
				return;
			}

			if (lastMessage?.role === "tool") {
				const trailingTools = getTrailingToolMessages(messages);
				const parsedToolMessages = trailingTools
					.map((toolMessage) =>
						parseToolMessageContent(
							typeof toolMessage.content === "string"
								? toolMessage.content
								: undefined,
						),
					)
					.filter(
						(
							parsed,
						): parsed is {
							message?: string;
							payload?: Record<string, unknown>;
						} => parsed !== null,
					);

				const imageURL = parsedToolMessages
					.map((toolMessage) => toolMessage.payload?.imageUrl)
					.find(
						(value): value is string => typeof value === "string",
					);

				if (imageURL) {
					sendJSON(
						res,
						200,
						completionPayload({
							role: "assistant",
							content: `Here is your preview image.\n\n![Hotstar Preview](${imageURL})`,
						}),
					);
					return;
				}

				const stitchedMessage = parsedToolMessages
					.map((toolMessage) => toolMessage.message)
					.filter(
						(message): message is string =>
							typeof message === "string" &&
							message.trim() !== "",
					)
					.join("\n");

				sendJSON(
					res,
					200,
					completionPayload({
						role: "assistant",
						content:
							stitchedMessage !== ""
								? stitchedMessage
								: "Tool run finished.",
					}),
				);
				return;
			}

			sendJSON(
				res,
				200,
				completionPayload({
					role: "assistant",
					content: "Mock provider default response.",
				}),
			);
			return;
		}

		res.statusCode = 404;
		res.end("Not Found");
	});

	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve());
	});

	const address = server.address() as AddressInfo;
	const baseUrl = `http://127.0.0.1:${address.port}`;

	return {
		baseUrl,
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			}),
		getInitialPromptCount: (prompt: string) =>
			initialPromptCount.get(normalizePrompt(prompt)) ?? 0,
		resetCounts: () => {
			initialPromptCount.clear();
		},
	};
};

// Outside production, `send` runs the worker's commands in the page. The
// clock and zone are fixed so the scenarios' April dates read the same
// everywhere and stay in the future.
const seedAIState = async (page: Page, providerBaseUrl: string) => {
	await page.clock.setFixedTime(new Date("2026-04-01T00:00:00+05:30"));
	await page.goto("/");
	await page.evaluate(
		async ({ providerBaseUrl }) => {
			const { send } = await import("/src/utils/send.ts");
			const { littleDB } = await import("/src/storage/pageDB.ts");
			const { putPreview } = await import("/src/storage/repositories.ts");
			const { importProfileKeys } = await import("/src/storage/keys.ts");
			const { sessionStore } = await import("/src/storage/session.ts");
			const at = (iso: string) => new Date(iso).getTime();

			await send("profile.create", {
				name: "Playwright User",
				password: null,
			});
			await send("profile.update", { theme: "dark" });
			await send("settings.update", {
				ai: {
					provider: "Custom",
					baseUrl: `${providerBaseUrl}/v1`,
					apiKey: "",
					model: "mock-model",
				},
			});
			await send("note.create", {
				content:
					"Project Phoenix sprint goals\n- Ship onboarding fixes\n- Review analytics",
			});
			await send("reminder.create", {
				message: "Standup with product and design",
				target: at("2026-04-05T18:00:00+05:30"),
			});
			await send("task.create", {
				information: "Ship AI reliability fixes",
				label: "Work",
				priority: "high",
				schedule: { kind: "due", at: at("2026-04-06T11:00:00+05:30") },
				reminder: null,
			});
			const { id: saveId } = await send("save.capture", {
				url: "https://www.hotstar.com/in/home",
				title: "JioHotstar - Watch TV Shows, Movies, Specials, Live Cricket & Football",
				saved: true,
			});
			const png = Uint8Array.from(
				atob(
					"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5n2xkAAAAASUVORK5CYII=",
				),
				(char) => char.charCodeAt(0),
			);
			const session = await sessionStore.get();
			await putPreview(
				littleDB,
				await importProfileKeys(session!),
				saveId,
				png,
				Date.now(),
			);
			localStorage.setItem(
				"userSettings",
				JSON.stringify({
					guide: { isFirstTimeUser: false },
				}),
			);
			localStorage.setItem("toasts", "[]");
		},
		{ providerBaseUrl },
	);

	await page.goto("/#/ai");
	await expect(page.getByTestId("ai-assist-input")).toBeVisible();
};

const askAI = async (
	page: Page,
	prompt: string,
	expectedText: string | RegExp,
) => {
	const input = page.getByTestId("ai-assist-input");
	await input.fill(prompt);
	await input.press("Enter");
	await expect(page.getByText(expectedText)).toBeVisible();
};

test.use({ timezoneId: "Asia/Kolkata" });

test.describe("AI Assist Playwright scenarios", () => {
	let mockProvider: MockProviderServer;

	test.beforeAll(async () => {
		mockProvider = await createMockProviderServer();
	});

	test.afterAll(async () => {
		await mockProvider.close();
	});

	test.beforeEach(async ({ page }) => {
		mockProvider.resetCounts();
		await seedAIState(page, mockProvider.baseUrl);
	});

	test("sends only one initial completion request for a plain response", async ({
		page,
	}) => {
		await askAI(page, "simple ping", "Pong from mock provider.");
		await page.waitForTimeout(400);
		expect(mockProvider.getInitialPromptCount("simple ping")).toBe(1);
	});

	test("runs multi-tool flow for productivity dashboard", async ({
		page,
	}) => {
		await askAI(page, "show productivity dashboard", "Overview:");
		await expect(
			page.getByText(/Found \d+ recent history item/),
		).toBeVisible();
	});

	test("searches notes, reminders, and tasks with tool-driven scenarios", async ({
		page,
	}) => {
		await askAI(page, "find project notes", "Found 1 note.");
		await askAI(
			page,
			"show reminders for april fifth",
			"Found 1 reminder.",
		);
		await askAI(page, "list high priority tasks", "Found 1 task.");
	});

	test("renders bookmark preview image in AI chat", async ({ page }) => {
		await askAI(
			page,
			"show hotstar preview",
			"Here is your preview image.",
		);
		const previewImage = page.locator("img[alt*='Hotstar']").first();
		await expect(previewImage).toBeVisible();
		await expect(previewImage).toHaveAttribute(
			"src",
			/^(blob:|data:image\/)/,
		);
	});

	test("creates a note with AI tool call and finds it afterward", async ({
		page,
	}) => {
		// Writes wait for in-chat confirmation (decision 0003).
		const input = page.getByTestId("ai-assist-input");
		await input.fill("add grocery note");
		await input.press("Enter");
		await expect(page.getByText("Create a note").first()).toBeVisible();
		await page.getByRole("button", { name: "Confirm change" }).click();
		await expect(
			page.getByText(/Created note|Created the note\./),
		).toBeVisible();
		await askAI(page, "find grocery notes", "Found");
		await expect(page.getByText(/Found \d+ note/)).toBeVisible();
	});
});
