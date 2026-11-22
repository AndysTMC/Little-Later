import type OpenAI from "openai";
import { isLoopbackUrl } from "./config";

export type LocalMcpToolDescriptor = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
};

const VALID_MCP_NAME = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_MCP_TOOLS = 20;
const MAX_MCP_OUTPUT_CHARS = 4_000;
const MCP_LIST_TIMEOUT_MS = 3_500;
const MCP_CALL_TIMEOUT_MS = 10_000;

export const MCP_TOOL_PREFIX = "mcp__";

export const validateLoopbackMcpUrl = (serverUrl: string): string => {
	const trimmed = serverUrl.trim();
	if (trimmed === "") {
		throw new Error("Local MCP server URL is empty.");
	}
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error("Invalid local MCP server URL.");
	}
	if (
		(parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
		!isLoopbackUrl(parsed)
	) {
		throw new Error(
			"Local MCP server URL must use localhost, 127.0.0.1, or [::1].",
		);
	}
	return parsed.toString();
};

const postJsonRpc = async (
	serverUrl: string,
	method: string,
	params: Record<string, unknown>,
	timeoutMs: number,
): Promise<unknown> => {
	const validated = validateLoopbackMcpUrl(serverUrl);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(validated, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: crypto.randomUUID(),
				method,
				params,
			}),
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(
				`MCP server responded with HTTP ${response.status}.`,
			);
		}
		const payload = (await response.json()) as {
			result?: unknown;
			error?: { message?: string };
		};
		if (payload.error) {
			throw new Error(payload.error.message || "MCP tool error.");
		}
		return payload.result;
	} finally {
		clearTimeout(timer);
	}
};

export const listMcpTools = async (
	serverUrl: string,
): Promise<Array<LocalMcpToolDescriptor>> => {
	const result = await postJsonRpc(
		serverUrl,
		"tools/list",
		{},
		MCP_LIST_TIMEOUT_MS,
	);
	if (!result || typeof result !== "object" || !("tools" in result)) {
		return [];
	}
	const rawTools = (result as { tools?: unknown }).tools;
	if (!Array.isArray(rawTools)) {
		return [];
	}
	const descriptors: Array<LocalMcpToolDescriptor> = [];
	for (const entry of rawTools) {
		if (!entry || typeof entry !== "object") continue;
		const record = entry as Record<string, unknown>;
		const name = typeof record.name === "string" ? record.name.trim() : "";
		if (!VALID_MCP_NAME.test(name)) continue;
		const description =
			typeof record.description === "string"
				? record.description.trim().slice(0, 300)
				: `Local MCP tool "${name}"`;
		const inputSchema =
			record.inputSchema &&
			typeof record.inputSchema === "object" &&
			!Array.isArray(record.inputSchema)
				? (record.inputSchema as Record<string, unknown>)
				: { type: "object", properties: {} };
		descriptors.push({ name, description, inputSchema });
		if (descriptors.length >= MAX_MCP_TOOLS) break;
	}
	return descriptors;
};

export const toOpenAIMcpTool = (
	descriptor: LocalMcpToolDescriptor,
): OpenAI.Chat.Completions.ChatCompletionFunctionTool => ({
	type: "function",
	function: {
		name: `${MCP_TOOL_PREFIX}${descriptor.name}`,
		description: `[Local MCP] ${descriptor.description}`,
		parameters: descriptor.inputSchema,
	},
});

export const callMcpTool = async (
	serverUrl: string,
	name: string,
	args: Record<string, unknown>,
): Promise<string> => {
	if (!VALID_MCP_NAME.test(name)) {
		throw new Error("Invalid MCP tool name.");
	}
	const result = await postJsonRpc(
		serverUrl,
		"tools/call",
		{ name, arguments: args },
		MCP_CALL_TIMEOUT_MS,
	);
	if (typeof result === "string") {
		return result.slice(0, MAX_MCP_OUTPUT_CHARS);
	}
	if (result && typeof result === "object" && "content" in result) {
		const content = (result as { content?: unknown }).content;
		if (Array.isArray(content)) {
			const texts = content
				.map((part) => {
					if (
						part &&
						typeof part === "object" &&
						"text" in part &&
						typeof (part as { text?: unknown }).text === "string"
					) {
						return (part as { text: string }).text;
					}
					return JSON.stringify(part);
				})
				.join("\n");
			return texts.slice(0, MAX_MCP_OUTPUT_CHARS);
		}
	}
	return JSON.stringify(result ?? {}).slice(0, MAX_MCP_OUTPUT_CHARS);
};
