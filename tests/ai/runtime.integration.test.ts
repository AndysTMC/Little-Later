/* @vitest-environment node */
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { LAI_PROVIDERS, LFACE_EXPRESSION } from "little-shared/enums";
import type { OpenAICompatibleAI as OpenAICompatibleAIClass } from "../../src/services/ai/main";

let fetchProviderModels: typeof import("../../src/services/ai/config").fetchProviderModels;
let OpenAICompatibleAI: typeof OpenAICompatibleAIClass;

type MockServerState = {
	baseUrl: string;
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
			const lastMessage = messages.at(-1);
			if (lastMessage?.role === "user") {
				const userText = String(lastMessage.content ?? "");
				requestAttempts.set(userText, (requestAttempts.get(userText) ?? 0) + 1);
				if (userText.includes("force_401")) {
					return sendJSON(res, 401, { error: "unauthorized" });
				}
				if (userText.includes("retry_transient")) {
					if ((requestAttempts.get(userText) ?? 0) === 1) {
						return sendJSON(res, 503, { error: "temporary_unavailable" });
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

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as AddressInfo;
	const baseUrl = `http://127.0.0.1:${address.port}`;
	return {
		baseUrl,
		close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
	};
};

describe("OpenAICompatibleAI integration", () => {
	let server: MockServerState;
	let ai: OpenAICompatibleAIClass;

	beforeAll(async () => {
		(globalThis as { self?: unknown }).self = globalThis;
		({ fetchProviderModels } = await import("../../src/services/ai/config"));
		({ OpenAICompatibleAI } = await import("../../src/services/ai/main"));
	});

	beforeEach(async () => {
		server = await createMockServer();
		ai = new OpenAICompatibleAI({
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
		expect(stages.filter((stage) => stage === "tool:Running tool")).toHaveLength(2);
		expect(stages.at(-1)).toBe("finalizing:Finalizing");
	});

	it("handles malformed tool arguments without crashing", async () => {
		const output = await ai.prompt("bad_args");
		expect(output.message).toBe("content is required.");
		expect(output.expression).toBe(LFACE_EXPRESSION.FROWNING);
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
			undefined,
			"Return JSON",
		);
		expect(output).toEqual({});
	});
});
