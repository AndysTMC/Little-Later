/* @vitest-environment node */
// The client checks its profile before each request (owner.ts).
import "fake-indexeddb/auto";
import { currentOwner } from "../../src/services/ai/owner";
import { freshProfile } from "./profile";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { LAI_PROVIDERS, LFACE_EXPRESSION } from "little-shared/enums";
import type { OpenAICompatibleAI as OpenAICompatibleAIClass } from "../../src/services/ai/main";

let fetchProviderModels: typeof import("../../src/services/ai/config").fetchProviderModels;
let OpenAICompatibleAI: typeof OpenAICompatibleAIClass;

type MockServerState = {
	baseUrl: string;
	recordedMessages: Array<Array<{ role?: string; content?: unknown }>>;
	close: () => Promise<void>;
};

const readBody = async (req: IncomingMessage): Promise<string> => {
	let body = "";
	for await (const chunk of req) {
		body += chunk;
	}
	return body;
};

const sendJSON = (res: ServerResponse, status: number, payload: unknown) => {
	res.statusCode = status;
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
	model: "test-model",
	choices: [
		{
			index: 0,
			message,
			finish_reason: finishReason,
		},
	],
});

const createMockServer = async (): Promise<MockServerState> => {
	const requestAttempts = new Map<string, number>();
	const recordedMessages: Array<Array<{ role?: string; content?: unknown }>> =
		[];
	const server = createServer(async (req, res) => {
		if (req.url === "/v1/models" && req.method === "GET") {
			return sendJSON(res, 200, {
				object: "list",
				data: [{ id: "test-model", object: "model" }],
			});
		}

		if (req.url === "/v1/chat/completions" && req.method === "POST") {
			const body = JSON.parse(await readBody(req));
			const messages = Array.isArray(body.messages) ? body.messages : [];
			recordedMessages.push(messages);
			const lastMessage = messages.at(-1);
			if (lastMessage?.role === "user") {
				const userText = String(lastMessage.content ?? "");
				requestAttempts.set(
					userText,
					(requestAttempts.get(userText) ?? 0) + 1,
				);
				if (userText.includes("force_401")) {
					return sendJSON(res, 401, { error: "unauthorized" });
				}
				if (userText.includes("retry_transient")) {
					if ((requestAttempts.get(userText) ?? 0) === 1) {
						return sendJSON(res, 503, {
							error: "temporary_unavailable",
						});
					}
					return sendJSON(
						res,
						200,
						completionPayload({
							role: "assistant",
							content: "recovered ok",
						}),
					);
				}
				if (userText.includes("retry_after_429")) {
					if ((requestAttempts.get(userText) ?? 0) === 1) {
						res.setHeader("Retry-After", "0");
						return sendJSON(res, 429, { error: "rate_limited" });
					}
					return sendJSON(
						res,
						200,
						completionPayload({
							role: "assistant",
							content: "rate limit recovered",
						}),
					);
				}
				if (userText.includes("plain_response")) {
					return sendJSON(
						res,
						200,
						completionPayload({
							role: "assistant",
							content: "plain ok",
						}),
					);
				}
				if (userText.includes("loop_repeat")) {
					return sendJSON(
						res,
						200,
						completionPayload(
							{
								role: "assistant",
								content: null,
								tool_calls: [
									{
										id: "call_loop_1",
										type: "function",
										function: {
											name: "get_current_date_time_info",
											arguments: "{}",
										},
									},
								],
							},
							"tool_calls",
						),
					);
				}
				if (userText.includes("parallel_reads")) {
					return sendJSON(
						res,
						200,
						completionPayload(
							{
								role: "assistant",
								content: null,
								tool_calls: [
									{
										id: "call_p1",
										type: "function",
										function: {
											name: "get_current_date_time_info",
											arguments: "{}",
										},
									},
									{
										id: "call_p2",
										type: "function",
										function: {
											name: "get_user_name",
											arguments: "{}",
										},
									},
								],
							},
							"tool_calls",
						),
					);
				}
				if (userText.includes("tool_multi")) {
					return sendJSON(
						res,
						200,
						completionPayload(
							{
								role: "assistant",
								content: null,
								tool_calls: [
									{
										id: "call_1",
										type: "function",
										function: {
											name: "get_current_date_time_info",
											arguments: "{}",
										},
									},
									{
										id: "call_2",
										type: "function",
										function: {
											name: "get_current_date_time_info",
											arguments: "{}",
										},
									},
								],
							},
							"tool_calls",
						),
					);
				}
				if (userText.includes("bad_args")) {
					return sendJSON(
						res,
						200,
						completionPayload(
							{
								role: "assistant",
								content: null,
								tool_calls: [
									{
										id: "call_3",
										type: "function",
										function: {
											name: "create_note",
											arguments: "{",
										},
									},
								],
							},
							"tool_calls",
						),
					);
				}
				if (userText.includes("structured_invalid")) {
					return sendJSON(
						res,
						200,
						completionPayload({
							role: "assistant",
							content: "{invalid",
						}),
					);
				}
			}

			if (lastMessage?.role === "tool") {
				const lastUser = [...messages]
					.reverse()
					.find((m: { role?: string }) => m.role === "user");
				const lastUserText = String(lastUser?.content ?? "");
				if (lastUserText.includes("loop_repeat")) {
					const toolContent = String(lastMessage.content ?? "");
					if (!toolContent.includes('"repeated":true')) {
						return sendJSON(
							res,
							200,
							completionPayload(
								{
									role: "assistant",
									content: null,
									tool_calls: [
										{
											id: "call_loop_2",
											type: "function",
											function: {
												name: "get_current_date_time_info",
												arguments: "{}",
											},
										},
									],
								},
								"tool_calls",
							),
						);
					}
					return sendJSON(
						res,
						200,
						completionPayload({
							role: "assistant",
							content: "loop recovered",
						}),
					);
				}
				return sendJSON(
					res,
					200,
					completionPayload({
						role: "assistant",
						content: "tools done",
					}),
				);
			}

			return sendJSON(
				res,
				200,
				completionPayload({
					role: "assistant",
					content: "fallback",
				}),
			);
		}

		res.statusCode = 404;
		res.end("Not Found");
	});

	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", resolve),
	);
	const address = server.address() as AddressInfo;
	const baseUrl = `http://127.0.0.1:${address.port}`;
	return {
		baseUrl,
		recordedMessages,
		close: () =>
			new Promise<void>((resolve, reject) =>
				server.close((err) => (err ? reject(err) : resolve())),
			),
	};
};

describe("OpenAICompatibleAI integration", () => {
	let server: MockServerState;
	let ai: OpenAICompatibleAIClass;

	beforeAll(async () => {
		(globalThis as { self?: unknown }).self = globalThis;
		({ fetchProviderModels } =
			await import("../../src/services/ai/config"));
		({ OpenAICompatibleAI } = await import("../../src/services/ai/main"));
	});

	beforeEach(async () => {
		server = await createMockServer();
		await freshProfile();
		ai = new OpenAICompatibleAI({
			owner: await currentOwner(),
			model: "test-model",
			provider: LAI_PROVIDERS.CUSTOM,
			apiKey: "",
			baseUrl: `${server.baseUrl}/v1`,
		});
	});

	afterEach(async () => {
		await server.close();
	});

	it("fetches models from OpenAI-compatible endpoint", async () => {
		const models = await fetchProviderModels({
			provider: LAI_PROVIDERS.CUSTOM,
			baseUrl: `${server.baseUrl}/v1`,
			apiKey: "",
		});
		expect(models).toContain("test-model");
	});

	it("returns plain assistant response", async () => {
		const output = await ai.prompt("plain_response");
		expect(output.message).toBe("plain ok");
		expect(output.actions).toEqual([]);
	});

	it("emits compact progress stages for plain responses", async () => {
		const stages: Array<string> = [];
		await ai.prompt("plain_response", {
			onProgress: (progress) => {
				stages.push(`${progress.stage}:${progress.message}`);
			},
		});

		expect(stages).toEqual([
			"preparing:Preparing",
			"reasoning:Thinking",
			"finalizing:Finalizing",
		]);
	});

	it("executes multiple tool calls in one turn", async () => {
		const output = await ai.prompt("tool_multi");
		expect(output.message).toBe("tools done");
		expect(output.expression).toBe(LFACE_EXPRESSION.SLIGHTLY_SMILING);
	});

	it("emits compact progress stages for tool flows", async () => {
		const stages: Array<string> = [];
		await ai.prompt("tool_multi", {
			onProgress: (progress) => {
				stages.push(`${progress.stage}:${progress.message}`);
			},
		});

		expect(stages[0]).toBe("preparing:Preparing");
		expect(stages[1]).toBe("reasoning:Thinking");
		expect(
			stages.filter((stage) => stage === "tool:Running tool"),
		).toHaveLength(2);
		expect(stages.at(-1)).toBe("finalizing:Finalizing");
	});

	it("handles malformed tool arguments without crashing", async () => {
		const output = await ai.prompt("bad_args");
		expect(output.confirmation).toBeDefined();
		const confirmed = await ai.confirmPendingMutations();
		expect(confirmed.message).toBe("content is required.");
		expect(confirmed.expression).toBe(LFACE_EXPRESSION.FROWNING);
	});

	it("maps 401 provider errors to user-safe output", async () => {
		const output = await ai.prompt("force_401");
		expect(output.message).toContain("Authentication failed (401)");
		expect(output.expression).toBe(LFACE_EXPRESSION.FROWNING);
	});

	it("retries transient provider failures before surfacing an error", async () => {
		const output = await ai.prompt("retry_transient");
		expect(output.message).toBe("recovered ok");
		expect(output.expression).toBe(LFACE_EXPRESSION.SLIGHTLY_SMILING);
	});

	it("returns empty object on invalid structured JSON", async () => {
		const output = await ai.getStructuredResponse(
			"structured_invalid",
			"Return JSON",
		);
		expect(output).toEqual({});
	});

	it("executes independent read-only tool calls in parallel and preserves order", async () => {
		const output = await ai.prompt("parallel_reads");
		expect(output.message).toBe("tools done");
		expect(output.expression).toBe(LFACE_EXPRESSION.SLIGHTLY_SMILING);
		const secondRequest = server.recordedMessages.at(-1) ?? [];
		const toolReplies = secondRequest.filter((m) => m.role === "tool");
		expect(toolReplies).toHaveLength(2);
		expect(String(toolReplies[0].content)).not.toContain('"repeated":true');
		expect(String(toolReplies[1].content)).not.toContain('"repeated":true');
	});

	it("intercepts identical repeated tool calls across rounds so the model recovers", async () => {
		const output = await ai.prompt("loop_repeat");
		expect(output.message).toBe("loop recovered");
		expect(output.expression).toBe(LFACE_EXPRESSION.SLIGHTLY_SMILING);
		const finalRequest = server.recordedMessages.at(-1) ?? [];
		const lastToolReply = finalRequest.at(-1);
		expect(lastToolReply?.role).toBe("tool");
		expect(String(lastToolReply?.content)).toContain('"repeated":true');
	});

	it("keeps prior turns prefix-stable by placing dynamic temporal context before the latest user turn", async () => {
		await ai.prompt("plain_response");
		await ai.prompt("plain_response today");
		const secondTurnMessages = server.recordedMessages.at(-1) ?? [];
		// [0] static system, [1] turn 1 user, [2] turn 1 assistant, [3] temporal system, [4] turn 2 user
		expect(secondTurnMessages[0]?.role).toBe("system");
		expect(secondTurnMessages[1]?.role).toBe("user");
		expect(secondTurnMessages[2]?.role).toBe("assistant");
		expect(secondTurnMessages[3]?.role).toBe("system");
		expect(String(secondTurnMessages[3]?.content)).toContain(
			"Current date/time context",
		);
		expect(secondTurnMessages[4]?.role).toBe("user");
	});

	it("honors Retry-After on 429 responses and recovers", async () => {
		const output = await ai.prompt("retry_after_429");
		expect(output.message).toBe("rate limit recovered");
		expect(output.expression).toBe(LFACE_EXPRESSION.SLIGHTLY_SMILING);
	});
});
