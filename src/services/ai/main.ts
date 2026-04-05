import OpenAI from "openai";
import { LAI_PROVIDERS, LFACE_EXPRESSION } from "little-shared/enums";
import { LAIOutput, LAIOutputContent } from "little-shared/types";
import {
	getResolvedBaseUrl,
	isAISettingsConfigured,
	responseFormats,
	script,
} from "./config";
import { LRewriteOptions, LSummarizeOptions, LWriteOptions } from "../../types";
import { ResponseFormatJSONSchema } from "openai/resources.mjs";
import { getUserSettings } from "../settings";
import { db } from "../../utils/db";
import {
	ToolDefinition,
	ToolExecutionResult,
	ToolUndoAction,
	createEmptyOutputContent,
	toolRegistry,
	tools,
} from "./toolRegistry";

type LLMRequestError = Error & {
	status?: number;
	responseBody?: string;
	isTimeout?: boolean;
	isParseError?: boolean;
};

type PromptProgress = {
	stage: "preparing" | "reasoning" | "tool" | "finalizing";
	message: string;
	toolName?: string;
	round?: number;
};

type PromptOptions = {
	onProgress?: (progress: PromptProgress) => void;
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const summarizeText = (value: string, maxLength = 120): string => {
	const normalized = value.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
};

const deriveNoteTitle = (content: string): string => {
	const firstNonEmptyLine =
		content
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line !== "") ?? "Untitled note";
	return summarizeText(firstNonEmptyLine, 72);
};

const summarizeNoteForContext = (note: {
	id: number;
	content: string;
	lastModificationDate?: string;
}): string => {
	const title = deriveNoteTitle(note.content);
	const snippet = summarizeText(note.content, 140);
	const modifiedSuffix = note.lastModificationDate
		? ` (last modified ${note.lastModificationDate})`
		: "";
	return `- ${title}${modifiedSuffix}: ${snippet}`;
};

const sanitizeAssistantContent = (content: string): string => {
	const withoutChannelTags = content
		.replace(/^<\|channel\|>.*?<\|message\|>/is, "")
		.replace(/^analysis\s*:\s*/i, "");
	return withoutChannelTags.replace(/\r\n/g, "\n").trim();
};

const personalContextPromptPatterns = [
	/\bwhat am i (currently )?(working on|doing)\b/i,
	/\bwhat was i (working on|doing)\b/i,
	/\bwhat (?:is|was) my (?:project|plan|focus|context)\b/i,
	/\bdo you remember\b/i,
	/\bfrom my notes\b/i,
	/\bbased on my notes\b/i,
	/\bwhat did i note\b/i,
];

const isLikelyPersonalContextPrompt = (input: string): boolean =>
	personalContextPromptPatterns.some((pattern) => pattern.test(input));

const relativeDatePromptPattern =
	/\b(today|tomorrow|tonight|next week|next month|this week|this weekend)\b/i;

const monthNumberByName = new Map<string, number>([
	["jan", 1],
	["january", 1],
	["feb", 2],
	["february", 2],
	["mar", 3],
	["march", 3],
	["apr", 4],
	["april", 4],
	["may", 5],
	["jun", 6],
	["june", 6],
	["jul", 7],
	["july", 7],
	["aug", 8],
	["august", 8],
	["sep", 9],
	["sept", 9],
	["september", 9],
	["oct", 10],
	["october", 10],
	["nov", 11],
	["november", 11],
	["dec", 12],
	["december", 12],
]);

const explicitMonthDatePattern =
	/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})(?:\s*(?:at)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i;

const extractPromptDateParts = (
	input: string,
):
	| {
			year: number;
			month: number;
			day: number;
			hour: number;
			minute: number;
			second: number;
	  }
	| null => {
	const match = input.match(explicitMonthDatePattern);
	if (!match) {
		return null;
	}
	const month = monthNumberByName.get(match[1].toLowerCase());
	if (!month) {
		return null;
	}
	const day = Number.parseInt(match[2], 10);
	const year = Number.parseInt(match[3], 10);
	let hour = match[4] ? Number.parseInt(match[4], 10) : 0;
	const minute = match[5] ? Number.parseInt(match[5], 10) : 0;
	const meridian = match[6]?.toLowerCase();
	if (meridian === "pm" && hour < 12) {
		hour += 12;
	}
	if (meridian === "am" && hour === 12) {
		hour = 0;
	}
	return {
		year,
		month,
		day,
		hour,
		minute,
		second: 0,
	};
};

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const safeJSONParse = <T>(value: string, fallback: T): T => {
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
};

const toSerializable = (value: unknown): unknown => {
	if (value === undefined) {
		return undefined;
	}
	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		return undefined;
	}
};

const mergeById = <T extends { id: number }>(
	base: Array<T>,
	incoming: Array<T>,
): Array<T> => {
	const merged = new Map<number, T>();
	for (const item of base) {
		merged.set(item.id, item);
	}
	for (const item of incoming) {
		merged.set(item.id, item);
	}
	return Array.from(merged.values());
};

const mergeOutputContent = (
	base: LAIOutputContent,
	incoming?: LAIOutputContent,
): LAIOutputContent => {
	if (!incoming) {
		return base;
	}
	return {
		saves: mergeById(base.saves, incoming.saves),
		reminders: mergeById(base.reminders, incoming.reminders),
		tasks: mergeById(base.tasks, incoming.tasks),
		notes: mergeById(base.notes, incoming.notes),
	};
};

const isOutputContentEmpty = (content: LAIOutputContent): boolean =>
	content.saves.length === 0 &&
	content.reminders.length === 0 &&
	content.tasks.length === 0 &&
	content.notes.length === 0;

export abstract class LittleAI {
	protected model: string;
	protected messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
	protected provider: LAI_PROVIDERS;
	protected apiKey: string;
	protected baseUrl: string;
	protected lastUndoAction: {
		action: ToolUndoAction;
		expiresAt: number;
	} | null;

	constructor({
		model,
		provider,
		apiKey,
		baseUrl,
	}: {
		model: string;
		provider: LAI_PROVIDERS;
		apiKey: string;
		baseUrl: string;
	}) {
		this.model = model;
		this.provider = provider;
		this.apiKey = apiKey;
		this.baseUrl = baseUrl;
		this.lastUndoAction = null;
		this.messages = [
			{
				role: "system",
				content: script,
			},
		];
	}

	abstract prompt(input: string, options?: PromptOptions): Promise<LAIOutput>;

	abstract rewrite(input: string, options?: LRewriteOptions): Promise<string>;

	abstract write(input: string, options?: LWriteOptions): Promise<string>;

	abstract summarize(
		input: string,
		options?: LSummarizeOptions,
	): Promise<string>;

	abstract getStructuredResponse(
		prompt: string,
		jsonSchema?: ResponseFormatJSONSchema.JSONSchema,
		jsonObjectSchema?: string,
	): Promise<unknown>;

	clear() {
		this.lastUndoAction = null;
		this.messages = [
			{
				role: "system",
				content: script,
			},
		];
	}

	hasUndoAction(): boolean {
		if (!this.lastUndoAction) {
			return false;
		}
		if (Date.now() > this.lastUndoAction.expiresAt) {
			this.lastUndoAction = null;
			return false;
		}
		return true;
	}

	async undoLastAction(): Promise<LAIOutput> {
		if (!this.hasUndoAction() || !this.lastUndoAction) {
			return {
				message: "No undo action is available.",
				actions: [],
				expression: LFACE_EXPRESSION.FROWNING,
			};
		}

		try {
			await this.lastUndoAction.action.run();
			const label = this.lastUndoAction.action.label;
			this.lastUndoAction = null;
			return {
				message: `Undid: ${label}.`,
				actions: [],
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		} catch {
			this.lastUndoAction = null;
			return {
				message: "Undo failed. Please try manually.",
				actions: [],
				expression: LFACE_EXPRESSION.FROWNING,
			};
		}
	}

	protected registerUndoActions(actions: Array<ToolUndoAction>): void {
		if (actions.length === 0) {
			return;
		}
		const actionToStore =
			actions.length === 1
				? actions[0]
				: {
					label: `Last ${actions.length} AI actions`,
					run: async () => {
						for (const action of actions.slice().reverse()) {
							await action.run();
						}
					},
				};
		this.lastUndoAction = {
			action: actionToStore,
			expiresAt: Date.now() + 5 * 60 * 1000,
		};
	}

	protected appendMessage(
		message: OpenAI.Chat.Completions.ChatCompletionMessageParam,
	): void {
		this.messages.push(message);
		this.trimMessageHistory();
	}

	protected buildCompletionMessages(
		requestContextMessages: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam>,
	): Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
		const [systemMessage, ...rest] = this.messages;
		return [systemMessage, ...requestContextMessages, ...rest];
	}

	protected async buildNoteContextMessages(
		input: string,
	): Promise<Array<OpenAI.Chat.Completions.ChatCompletionMessageParam>> {
		if (!isLikelyPersonalContextPrompt(input)) {
			return [];
		}

		const searchNotesDefinition = toolRegistry.get("search_notes");
		let contextualNotes: Array<{
			id: number;
			content: string;
			lastModificationDate?: string;
		}> = [];

		if (searchNotesDefinition) {
			try {
				const result = await searchNotesDefinition.execute(
					searchNotesDefinition.normalizeArgs({ query: input }),
					{ ai: this },
				);
				contextualNotes = result.content?.notes ?? [];
			} catch {
				contextualNotes = [];
			}
		}

		if (contextualNotes.length === 0) {
			try {
				contextualNotes = (await db.noteTbl.toArray())
					.sort((left, right) =>
						(right.lastModificationDate ?? "").localeCompare(
							left.lastModificationDate ?? "",
						),
					)
					.slice(0, 5);
			} catch {
				contextualNotes = [];
			}
		}

		if (contextualNotes.length === 0) {
			return [];
		}

		const lines = contextualNotes
			.slice(0, 5)
			.map((note) => summarizeNoteForContext(note));

		return [
			{
				role: "system",
				content: `Prefetched note context for this request. Use these notes before broad summaries or task overviews unless the user explicitly asked for tasks only.\n${lines.join("\n")}`,
			},
		];
	}

	protected async buildTemporalContextMessages(
		input: string,
	): Promise<Array<OpenAI.Chat.Completions.ChatCompletionMessageParam>> {
		const contextMessages: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> =
			[];

		if (relativeDatePromptPattern.test(input)) {
			const currentDateTimeDefinition = toolRegistry.get(
				"get_current_date_time_info",
			);
			if (currentDateTimeDefinition) {
				try {
					const result = await currentDateTimeDefinition.execute(
						currentDateTimeDefinition.normalizeArgs({}),
						{ ai: this },
					);
					if (result.message) {
						contextMessages.push({
							role: "system",
							content: `Current date/time context for this request:\n${result.message}\nUse it before resolving any relative date or time phrase.`,
						});
					}
				} catch {
					// Ignore prefetch failures and continue normally.
				}
			}
		}

		const explicitDateParts = extractPromptDateParts(input);
		if (explicitDateParts) {
			const formatDateTimeDefinition = toolRegistry.get("format_date_time");
			if (formatDateTimeDefinition) {
				try {
					const result = await formatDateTimeDefinition.execute(
						formatDateTimeDefinition.normalizeArgs(explicitDateParts),
						{ ai: this },
					);
					const dateTime = asRecord(result.modelPayload).dateTime;
					if (typeof dateTime === "string" && dateTime.trim() !== "") {
						contextMessages.push({
							role: "system",
							content: `Canonical Little Later date-time for this request: ${dateTime}. Use this exact value when calling reminder or task tools, and add date criteria fields when the user asked for partial date matching.`,
						});
					}
				} catch {
					// Ignore prefetch failures and continue normally.
				}
			}
		}

		return contextMessages;
	}

	private trimMessageHistory(maxMessages = 40): void {
		if (this.messages.length <= maxMessages + 1) {
			return;
		}
		const [systemMessage, ...rest] = this.messages;
		this.messages = [systemMessage, ...rest.slice(-maxMessages)];
	}

	protected get shouldUseHeaderlessFetch(): boolean {
		return (
			this.provider !== LAI_PROVIDERS.CUSTOM ||
			this.apiKey.trim() === ""
		);
	}

	protected get effectiveApiKey(): string {
		if (this.provider !== LAI_PROVIDERS.CUSTOM) {
			return "";
		}
		return this.apiKey.trim();
	}

	protected toLLMRequestError(error: unknown): LLMRequestError {
		const wrappedError = new Error("LLM request failed") as LLMRequestError;
		if (error instanceof DOMException && error.name === "AbortError") {
			wrappedError.message = "LLM request timed out";
			wrappedError.isTimeout = true;
			return wrappedError;
		}
		if (error instanceof SyntaxError) {
			wrappedError.message = "LLM response could not be parsed";
			wrappedError.isParseError = true;
			return wrappedError;
		}
		if (error && typeof error === "object") {
			const rawStatus = (error as { status?: unknown }).status;
			const rawMessage = (error as { message?: unknown }).message;
			const rawBody = (error as { responseBody?: unknown }).responseBody;
			if (typeof rawStatus === "number") {
				wrappedError.status = rawStatus;
			}
			if (typeof rawMessage === "string" && rawMessage.trim() !== "") {
				wrappedError.message = rawMessage;
			}
			if (typeof rawBody === "string" && rawBody.trim() !== "") {
				wrappedError.responseBody = rawBody;
			}
		}
		if (!(error && typeof error === "object")) {
			wrappedError.message = String(error);
		}
		return wrappedError;
	}

	protected async createChatCompletion(
		params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
	): Promise<OpenAI.Chat.Completions.ChatCompletion> {
		let lastError: LLMRequestError | null = null;
		const maxAttempts = 3;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			try {
				return await this.createChatCompletionOnce(params);
			} catch (error: unknown) {
				const resolvedError = this.toLLMRequestError(error);
				lastError = resolvedError;
				if (
					attempt >= maxAttempts - 1 ||
					!this.shouldRetryLLMRequest(resolvedError)
				) {
					throw resolvedError;
				}
				await sleep(this.getRetryDelayMs(attempt, resolvedError));
			}
		}

		throw lastError ?? this.toLLMRequestError(new Error("LLM request failed"));
	}

	private shouldRetryLLMRequest(error: LLMRequestError): boolean {
		if (error.isTimeout || error.isParseError) {
			return true;
		}
		if (error.status === undefined) {
			return true;
		}
		return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
	}

	private getRetryDelayMs(
		attempt: number,
		error: LLMRequestError,
	): number {
		if (error.status === 429) {
			return 1200 * (attempt + 1);
		}
		if (error.status !== undefined && error.status >= 500) {
			return 750 * (attempt + 1);
		}
		if (error.isTimeout) {
			return 500 * (attempt + 1);
		}
		return 350 * (attempt + 1);
	}

	private async createChatCompletionOnce(
		params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
	): Promise<OpenAI.Chat.Completions.ChatCompletion> {
		if (!this.shouldUseHeaderlessFetch) {
			const api = new OpenAI({
				apiKey: this.effectiveApiKey,
				baseURL: this.baseUrl,
				dangerouslyAllowBrowser: true,
			});
			try {
				return await api.chat.completions.create(params);
			} catch (error: unknown) {
				throw this.toLLMRequestError(error);
			}
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 60000);
		const normalizedBaseUrl = this.baseUrl.replace(/\/+$/, "");
		const endpoint = normalizedBaseUrl.endsWith("/chat/completions")
			? normalizedBaseUrl
			: `${normalizedBaseUrl}/chat/completions`;
		try {
			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(params),
				signal: controller.signal,
			});

			if (!response.ok) {
				const responseBody = (await response.text()).slice(0, 240);
				const error = new Error(
					`LLM request failed with status ${response.status}`,
				) as LLMRequestError;
				error.status = response.status;
				error.responseBody = responseBody;
				throw error;
			}

			return (await response.json()) as OpenAI.Chat.Completions.ChatCompletion;
		} catch (error: unknown) {
			throw this.toLLMRequestError(error);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	protected buildLLMErrorOutput(error: unknown): LAIOutput {
		const resolvedError = this.toLLMRequestError(error);
		if (resolvedError.isTimeout) {
			return {
				message: "The AI request timed out. Please retry.",
				actions: [],
				expression: LFACE_EXPRESSION.FROWNING,
			};
		}
		if (resolvedError.isParseError) {
			return {
				message: "The AI provider returned an unreadable response. Please retry.",
				actions: [],
				expression: LFACE_EXPRESSION.FROWNING,
			};
		}
		const status = resolvedError.status;
		if (status === 401) {
			return {
				message: "Authentication failed (401). Check your API key in AI Settings.",
				actions: [],
				expression: LFACE_EXPRESSION.FROWNING,
			};
		}
		if (status === 403) {
			if (
				this.provider === LAI_PROVIDERS.OLLAMA ||
				this.baseUrl.includes("127.0.0.1:11434") ||
				this.baseUrl.includes("localhost:11434")
			) {
				const extensionOrigin =
					typeof chrome !== "undefined" && chrome?.runtime?.id
						? `chrome-extension://${chrome.runtime.id}`
						: "chrome-extension://<your-extension-id>";
				return {
					message: `Ollama rejected this extension origin (403). Add ${extensionOrigin} to OLLAMA_ORIGINS (or use *), restart Ollama, then try again.`,
					actions: [],
					expression: LFACE_EXPRESSION.FROWNING,
				};
			}
			return {
				message: "Request rejected (403). Verify provider permissions and credentials.",
				actions: [],
				expression: LFACE_EXPRESSION.FROWNING,
			};
		}
		if (status === 429) {
			return {
				message: "Rate limit hit (429). Please retry in a moment.",
				actions: [],
				expression: LFACE_EXPRESSION.FROWNING,
			};
		}
		if (status !== undefined && status >= 500) {
			return {
				message: "AI provider is temporarily unavailable. Please try again soon.",
				actions: [],
				expression: LFACE_EXPRESSION.FROWNING,
			};
		}
		return {
			message: "Sorry, something went wrong. Please try again.",
			actions: [],
			expression: LFACE_EXPRESSION.FROWNING,
		};
	}

	static getLAIAssistInstance = async (): Promise<LittleAI> => {
		const userSettings = await getUserSettings();
		const { ai: aiSettings } = userSettings;
		const { provider, model, apiKey } = aiSettings;
		const normalizedBaseUrl = getResolvedBaseUrl(aiSettings);
		const normalizedApiKey =
			provider === LAI_PROVIDERS.CUSTOM ? apiKey.trim() : "";

		if (!isAISettingsConfigured(aiSettings)) {
			return new OpenAICompatibleAI({
				model: "",
				provider,
				apiKey: normalizedApiKey,
				baseUrl: normalizedBaseUrl,
			});
		}

		return new OpenAICompatibleAI({
			model,
			provider,
			apiKey: normalizedApiKey,
			baseUrl: normalizedBaseUrl,
		});
	};

	static getLAIRephraseInstance = async (): Promise<LittleAI> => {
		return LittleAI.getLAIAssistInstance();
	};
	static getLAIGenerateInstance = async (): Promise<LittleAI> => {
		return LittleAI.getLAIAssistInstance();
	};
	static getLAISummarizeInstance = async (): Promise<LittleAI> => {
		return LittleAI.getLAIAssistInstance();
	};
}

export class OpenAICompatibleAI extends LittleAI {
	constructor({
		model,
		apiKey,
		provider,
		baseUrl,
	}: {
		model: string;
		apiKey: string;
		provider: LAI_PROVIDERS;
		baseUrl: string;
	}) {
		super({ model, provider, apiKey, baseUrl });
	}

	private parseToolArgs(rawArgs: string): Record<string, unknown> {
		const parsedArgs = safeJSONParse<unknown>(rawArgs, {});
		return asRecord(parsedArgs);
	}

	private async executeToolCall(
		toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
	): Promise<ToolExecutionResult> {
		const definition = toolRegistry.get(toolCall.function.name);
		if (!definition) {
			return {
				message: `Tool '${toolCall.function.name}' is not supported.`,
				expression: LFACE_EXPRESSION.FROWNING,
			};
		}

		const parsedArgs = this.parseToolArgs(toolCall.function.arguments);
		const normalizedArgs = definition.normalizeArgs(parsedArgs);

		try {
			return await definition.execute(normalizedArgs, { ai: this });
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : "Tool execution failed.";
			return {
				message,
				expression: LFACE_EXPRESSION.FROWNING,
			};
		}
	}

	private appendToolResult(
		toolCallId: string,
		result: ToolExecutionResult,
	): void {
		const modelPayload = toSerializable(result.modelPayload);
		const toolPayload = {
			message: result.modelMessage ?? result.message ?? "",
			hasContent: Boolean(result.content),
			payload: modelPayload,
		};
		this.appendMessage({
			role: "tool",
			tool_call_id: toolCallId,
			content: JSON.stringify(toolPayload),
		});
	}

	async prompt(input: string, options?: PromptOptions): Promise<LAIOutput> {
		const emitProgress = (
			message: string,
			stage: PromptProgress["stage"],
			toolName?: string,
			round?: number,
		): void => {
			options?.onProgress?.({
				message,
				stage,
				toolName,
				round,
			});
		};

		if (this.model.trim() === "" || this.baseUrl.trim() === "") {
			return {
				message:
					"AI is not configured yet. Please set provider, base URL, and model in AI Settings.",
				actions: [],
				expression: LFACE_EXPRESSION.FROWNING,
			};
		}

		emitProgress("Preparing", "preparing");

		const requestContextMessages = [
			...(await this.buildTemporalContextMessages(input)),
			...(await this.buildNoteContextMessages(input)),
		];

		this.appendMessage({
			role: "user",
			content: input,
		});

		let aggregatedContent = createEmptyOutputContent();
		let aggregatedExpression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
		let hasToolError = false;
		const aggregatedToolMessages: Array<string> = [];
		const undoActions: Array<ToolUndoAction> = [];

		const maxToolRounds = 4;
		for (let round = 0; round < maxToolRounds; round++) {
			if (round === 0) {
				emitProgress("Thinking", "reasoning", undefined, round + 1);
			} else {
				emitProgress("Thinking", "reasoning", undefined, round + 1);
			}

			let completion: OpenAI.Chat.Completions.ChatCompletion;
			try {
				completion = await this.createChatCompletion({
					model: this.model,
					messages: this.buildCompletionMessages(requestContextMessages),
					n: 1,
					tools,
					tool_choice: "auto",
				});
			} catch (error: unknown) {
				return this.buildLLMErrorOutput(error);
			}

			const assistantMessage = completion.choices[0].message;
			this.appendMessage({
				role: "assistant",
				content: assistantMessage.content ?? "",
				tool_calls:
					assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0
						? assistantMessage.tool_calls
						: undefined,
			});

			if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
				emitProgress("Finalizing", "finalizing", undefined, round + 1);
				const finalMessage = sanitizeAssistantContent(
					assistantMessage.content ?? "",
				);
				const latestToolImageMessage = [...aggregatedToolMessages]
					.reverse()
					.find((message) => message.includes("!["));
				let resolvedMessage =
					finalMessage && finalMessage !== ""
						? finalMessage
						: aggregatedToolMessages.at(-1) ?? "Done.";
				if (
					latestToolImageMessage &&
					!resolvedMessage.includes("![")
				) {
					resolvedMessage = `${resolvedMessage}\n\n${latestToolImageMessage}`;
				}
				const output: LAIOutput = {
					message: resolvedMessage,
					actions: [],
					expression: hasToolError
						? LFACE_EXPRESSION.FROWNING
						: aggregatedExpression,
				};
				if (!isOutputContentEmpty(aggregatedContent)) {
					output.content = aggregatedContent;
				}
				this.registerUndoActions(undoActions);
				return output;
			}

			for (const call of assistantMessage.tool_calls) {
				emitProgress(
					"Running tool",
					"tool",
					call.function.name,
					round + 1,
				);
				const result = await this.executeToolCall(call);
				if (result.message) {
					aggregatedToolMessages.push(result.message);
				}
				if (result.expression === LFACE_EXPRESSION.FROWNING) {
					hasToolError = true;
				}
				aggregatedExpression = result.expression ?? aggregatedExpression;
				aggregatedContent = mergeOutputContent(
					aggregatedContent,
					result.content,
				);
				if (result.undoAction) {
					undoActions.push(result.undoAction);
				}
				this.appendToolResult(call.id, result);
			}

			const roundDefinitions = assistantMessage.tool_calls
				.map((call) => toolRegistry.get(call.function.name))
				.filter(
					(definition): definition is ToolDefinition =>
						definition !== undefined,
				);
			const roundHasReadTools = roundDefinitions.some(
				(definition) => definition.safety?.kind === "read",
			);
			const roundHasMutatingTools = roundDefinitions.some(
				(definition) => definition.safety?.kind !== "read",
			);

			if (roundHasMutatingTools && !roundHasReadTools) {
				emitProgress("Finalizing", "finalizing", undefined, round + 1);
				this.registerUndoActions(undoActions);
				const output: LAIOutput = {
					message:
						aggregatedToolMessages.at(-1) ??
						"Completed the requested action.",
					actions: [],
					expression: hasToolError
						? LFACE_EXPRESSION.FROWNING
						: aggregatedExpression,
				};
				if (!isOutputContentEmpty(aggregatedContent)) {
					output.content = aggregatedContent;
				}
				return output;
			}
		}

		emitProgress("Finalizing", "finalizing");
		this.registerUndoActions(undoActions);
		return {
			message:
				aggregatedToolMessages.at(-1) ??
				"Completed available actions, but could not generate a final response.",
			actions: [],
			expression: hasToolError
				? LFACE_EXPRESSION.FROWNING
				: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			content: isOutputContentEmpty(aggregatedContent)
				? undefined
				: aggregatedContent,
		};
	}

	async rewrite(input: string, options?: LRewriteOptions): Promise<string> {
		if (this.model.trim() === "" || this.baseUrl.trim() === "") {
			return input;
		}
		const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
			{
				role: "system",
				content: `
					You are an expert rewriter. Rewrite the user's input based on the following options:
					Tone: ${options?.tone || "as-is"}
					Format: ${options?.format || "as-is"}
					Length: ${options?.length || "as-is"}
					${options?.sharedContext ? `Context: ${options.sharedContext}` : ""}
				`,
			},
			{
				role: "user",
				content: input,
			},
		];

		try {
			const completion = await this.createChatCompletion({
				model: this.model,
				messages,
				n: 1,
			});
			return completion.choices[0].message.content || input;
		} catch {
			return input;
		}
	}

	async write(input: string, options?: LWriteOptions): Promise<string> {
		if (this.model.trim() === "" || this.baseUrl.trim() === "") {
			return "";
		}
		const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
			{
				role: "system",
				content: `
					You are an expert AI Content Generator. Generate the content based on user's input with the following requirements:
					Tone: ${options?.tone || "as-is"}
					Format: ${options?.format || "as-is"}
					Length: ${options?.length || "as-is"}
					${options?.sharedContext ? `Context: ${options.sharedContext}` : ""}
				`,
			},
			{
				role: "user",
				content: input,
			},
		];

		try {
			const completion = await this.createChatCompletion({
				model: this.model,
				messages,
				n: 1,
			});
			return completion.choices[0].message.content || "";
		} catch {
			return "";
		}
	}

	async getStructuredResponse(
		prompt: string,
		jsonSchema?: ResponseFormatJSONSchema.JSONSchema,
		jsonObjectInstruction?: string,
	): Promise<unknown> {
		if (this.model.trim() === "" || this.baseUrl.trim() === "") {
			return {};
		}

		const useJSONSchema = responseFormats.get(this.provider) === "json_schema";
		const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
			{
				role: "user",
				content: useJSONSchema
					? prompt
					: `${prompt}\n\n${jsonObjectInstruction ?? ""}`,
			},
		];

		try {
			const completion = await this.createChatCompletion({
				model: this.model,
				messages,
				n: 1,
				response_format: useJSONSchema
					? {
						type: "json_schema",
						json_schema: jsonSchema!,
					}
					: {
						type: "json_object",
					},
			});
			const rawContent = completion.choices[0].message.content || "{}";
			return safeJSONParse(rawContent, {});
		} catch {
			return {};
		}
	}

	async summarize(
		input: string,
		options?: LSummarizeOptions,
	): Promise<string> {
		if (this.model.trim() === "" || this.baseUrl.trim() === "") {
			return input;
		}
		const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
			{
				role: "system",
				content: `
					You are an expert summarizer. Summarize the user's input based on the following options:
					Type: ${options?.type || "tldr"}
					Format: ${options?.format || "as-is"}
					Length: ${options?.length || "as-is"}
					${options?.sharedContext ? `Context: ${options.sharedContext}` : ""}
				`,
			},
			{
				role: "user",
				content: input,
			},
		];
		try {
			const completion = await this.createChatCompletion({
				model: this.model,
				messages,
				n: 1,
			});
			return completion.choices[0].message.content || input;
		} catch {
			return input;
		}
	}
}
