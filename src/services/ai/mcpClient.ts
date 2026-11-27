import type OpenAI from "openai";
import type { LAIMcpServer, LAISettings } from "little-shared/types";
import { isLoopbackUrl } from "./config";

export type LocalMcpToolDescriptor = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
};

export type McpServerTestResult = {
	ok: boolean;
	message: string;
	toolCount: number;
	tools: Array<LocalMcpToolDescriptor>;
};

const VALID_MCP_NAME = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_OPENAI_TOOL_NAME_LEN = 64;
const MAX_MCP_TOOLS_PER_SERVER = 20;
export const MAX_MCP_SERVERS = 10;
export const MAX_TOTAL_MCP_TOOLS = 40;
const MAX_MCP_OUTPUT_CHARS = 4_000;
const MCP_LIST_TIMEOUT_MS = 3_500;
const MCP_CALL_TIMEOUT_MS = 10_000;

export const MCP_TOOL_PREFIX = "mcp__";

const shortStableHash = (input: string): string => {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36).padStart(6, "0").slice(0, 6);
};

/**
 * Formats an MCP server URL for user-facing confirmation prompts: keeps the
 * origin and path (to distinguish servers sharing a host/port) while stripping
 * credentials, query values, and fragments.
 */
export const formatSafeMcpEndpoint = (serverUrl: string): string => {
	try {
		const parsed = new URL(serverUrl.trim());
		const path = parsed.pathname === "/" ? "" : parsed.pathname;
		const queryKeys = [...new Set(parsed.searchParams.keys())];
		const query =
			queryKeys.length > 0
				? `?${queryKeys.map((key) => `${key}=[redacted]`).join("&")}`
				: "";
		return `${parsed.origin}${path}${query}`;
	} catch {
		return "local MCP server";
	}
};

/**
 * Generates a unique, OpenAI-valid (`^[a-zA-Z0-9_-]{1,64}$`) function alias
 * for an MCP tool while preserving the raw MCP tool name separately for
 * dispatch. Uses deterministic server identity when names collide or exceed
 * the 64-character provider limit.
 */
export const buildMcpExposedName = (
	server: Pick<LAIMcpServer, "id" | "name">,
	rawToolName: string,
	usedNames: { has(name: string): boolean },
): string => {
	const safeTool = rawToolName.replace(/[^a-zA-Z0-9_-]+/g, "_") || "tool";
	const direct = `${MCP_TOOL_PREFIX}${safeTool}`;
	if (direct.length <= MAX_OPENAI_TOOL_NAME_LEN && !usedNames.has(direct)) {
		return direct;
	}

	const slug =
		server.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.slice(0, 16) || "srv";
	const withSlug = `${MCP_TOOL_PREFIX}${slug}__${safeTool}`;
	if (
		withSlug.length <= MAX_OPENAI_TOOL_NAME_LEN &&
		!usedNames.has(withSlug)
	) {
		return withSlug;
	}

	const idTag = shortStableHash(`${server.id}:${server.name}`);
	const basePrefix = `${MCP_TOOL_PREFIX}${slug.slice(0, 10)}_${idTag}__`;
	const maxToolLen = Math.max(
		1,
		MAX_OPENAI_TOOL_NAME_LEN - basePrefix.length,
	);
	let candidate = `${basePrefix}${safeTool.slice(0, maxToolLen)}`;
	let suffix = 2;
	while (usedNames.has(candidate)) {
		const tag = `_${suffix}`;
		const trimmedTool = safeTool.slice(
			0,
			Math.max(1, maxToolLen - tag.length),
		);
		candidate = `${basePrefix}${trimmedTool}${tag}`;
		suffix += 1;
	}
	return candidate;
};

/**
 * Validates that an MCP server URL uses http or https on a loopback address
 * (`localhost`, `127.0.0.1`, or `[::1]`).
 */
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

/**
 * Resolves the configured local MCP servers from `LAISettings`, seamlessly
 * upgrading a legacy single `mcpServerUrl` into an enabled server entry.
 */
export const resolveMcpServers = (
	aiSettings?: Pick<LAISettings, "mcpServerUrl" | "mcpServers"> | null,
): Array<LAIMcpServer> => {
	if (!aiSettings) return [];
	if (Array.isArray(aiSettings.mcpServers)) {
		return aiSettings.mcpServers
			.filter((server) => server.url.trim() !== "")
			.slice(0, MAX_MCP_SERVERS);
	}
	const legacy = aiSettings.mcpServerUrl?.trim() ?? "";
	if (legacy === "") return [];
	return [
		{
			id: "legacy-local-mcp",
			name: "Local MCP",
			url: legacy,
			enabled: true,
		},
	];
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
			redirect: "error",
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
		if (descriptors.length >= MAX_MCP_TOOLS_PER_SERVER) break;
	}
	return descriptors;
};

/**
 * Tests connectivity to a local MCP server and reports the discovered tool count.
 */
export const testMcpServer = async (
	serverUrl: string,
): Promise<McpServerTestResult> => {
	try {
		const tools = await listMcpTools(serverUrl);
		return {
			ok: true,
			toolCount: tools.length,
			tools,
			message:
				tools.length === 1
					? "Connected — 1 tool available."
					: `Connected — ${tools.length} tools available.`,
		};
	} catch (error) {
		return {
			ok: false,
			toolCount: 0,
			tools: [],
			message:
				error instanceof Error
					? error.message
					: "Could not connect to local MCP server.",
		};
	}
};

export const toOpenAIMcpTool = (
	descriptor: LocalMcpToolDescriptor,
	options?: { exposedName?: string; serverName?: string },
): OpenAI.Chat.Completions.ChatCompletionFunctionTool => {
	const label = options?.serverName
		? `[MCP · ${options.serverName}]`
		: "[Local MCP]";
	return {
		type: "function",
		function: {
			name:
				options?.exposedName ?? `${MCP_TOOL_PREFIX}${descriptor.name}`,
			description: `${label} ${descriptor.description}`,
			parameters: descriptor.inputSchema,
		},
	};
};

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
