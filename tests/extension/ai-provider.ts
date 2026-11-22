import type { Page } from "@playwright/test";
import { expect } from "./fixtures";
import { command, startLocalServer } from "./support";

type ProviderRequest = {
	method: string | undefined;
	path: string | undefined;
	origin: string | undefined;
	body: {
		messages?: { role: string; content: string }[];
		response_format?: unknown;
	};
};

type Answer =
	| { content: string; delayMs?: number }
	| { tool: string; args: Record<string, unknown> }
	| { error: string };

export const startProvider = async (
	reply: (request: ProviderRequest) => Answer = () => ({
		content: "Pong from the local fixture.",
	}),
) => {
	const requests: ProviderRequest[] = [];
	const server = await startLocalServer(async (req, res) => {
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Headers", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		if (req.method === "OPTIONS") {
			res.writeHead(204).end();
			return;
		}
		const bytes: Buffer[] = [];
		for await (const bytesPart of req) bytes.push(Buffer.from(bytesPart));
		const request = {
			method: req.method,
			path: req.url,
			origin: req.headers.origin,
			body:
				bytes.length === 0
					? {}
					: JSON.parse(Buffer.concat(bytes).toString()),
		};
		requests.push(request);
		res.setHeader("Content-Type", "application/json");
		if (req.method === "GET" && req.url === "/v1/models") {
			res.end(
				JSON.stringify({
					object: "list",
					data: [{ id: "fixture-model", object: "model" }],
				}),
			);
			return;
		}
		if (req.url !== "/v1/chat/completions" || req.method !== "POST") {
			res.writeHead(404).end();
			return;
		}
		const answer = reply(request);
		if ("delayMs" in answer && answer.delayMs) {
			await new Promise((resolve) => setTimeout(resolve, answer.delayMs));
		}
		if ("error" in answer) {
			res.writeHead(400).end(
				JSON.stringify({ error: { message: answer.error } }),
			);
			return;
		}
		const message =
			"tool" in answer
				? {
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "fixture-call",
								type: "function",
								function: {
									name: answer.tool,
									arguments: JSON.stringify(answer.args),
								},
							},
						],
					}
				: { role: "assistant", content: answer.content };
		res.end(
			JSON.stringify({
				choices: [
					{
						index: 0,
						message,
						finish_reason: "tool" in answer ? "tool_calls" : "stop",
					},
				],
			}),
		);
	});
	return { ...server, requests };
};

export const configureAI = async (page: Page, url: string) => {
	await command(page, "settings.update", {
		ai: {
			provider: "Custom",
			baseUrl: url + "/v1",
			apiKey: "",
			model: "fixture-model",
		},
	});
	await expect(
		page.getByRole("button", { name: "Open LittleAI" }),
	).toBeVisible();
};
