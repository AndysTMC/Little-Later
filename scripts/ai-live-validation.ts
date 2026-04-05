import "fake-indexeddb/auto";
import Dexie from "dexie";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { JSDOM } from "jsdom";
import type { OpenAICompatibleAI as OpenAICompatibleAIType } from "../src/services/ai/main";
import {
	LAI_PROVIDERS,
	LFACE_EXPRESSION,
	LINT_BOOLEAN,
	LREMINDER_TYPE,
	LTASK_PRIORITY,
	LTASK_SCHEDULE_TYPE,
	LTHEME,
} from "little-shared/enums";
import { LDateUtl } from "little-shared/utils/datetime";

(globalThis as { self?: unknown }).self = globalThis;
Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

let db: typeof import("../src/utils/db").db;
let resetLLDB: typeof import("../src/utils/db").resetLLDB;
let OpenAICompatibleAIClass: typeof OpenAICompatibleAIType;
let liveToolRegistry: typeof import("../src/services/ai/toolRegistry").toolRegistry;

type ToolExecutionRecorder = {
	getExecutions: () => Array<string>;
	restore: () => void;
};

type ScenarioResult = {
	name: string;
	prompt: string;
	passed: boolean;
	expectedTools: Array<string>;
	forbiddenTools: Array<string>;
	executedTools: Array<string>;
	expression: string;
	messagePreview: string;
	progress: Array<string>;
	reason?: string;
};

type Scenario = {
	name: string;
	prompt: string;
	expectedTools?: Array<string>;
	forbiddenTools?: Array<string>;
	expectExpression?: LFACE_EXPRESSION;
	validate?: (output: Awaited<ReturnType<OpenAICompatibleAIType["prompt"]>>) => Promise<string | null> | string | null;
};

const DEFAULT_MODEL = "google/gemma-4-31b-it";
const storageMap = new Map<string, string>();
const debugEnabled = process.env.AI_LIVE_DEBUG === "1";
const scenarioFilter = process.env.AI_LIVE_ONLY?.trim().toLowerCase() ?? "";

const requireEnv = (name: string): string => {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
};

const joinUrl = (baseUrl: string, path: string): string =>
	`${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

const extractModels = (payload: unknown): Array<string> => {
	if (!payload || typeof payload !== "object") {
		return [];
	}

	const fromData =
		"data" in payload && Array.isArray(payload.data)
			? payload.data
					.map((item) => {
						if (!item || typeof item !== "object") {
							return null;
						}
						return "id" in item && typeof item.id === "string" ? item.id : null;
					})
					.filter((value): value is string => value !== null)
			: [];

	const fromModels =
		"models" in payload && Array.isArray(payload.models)
			? payload.models
					.map((item) => {
						if (!item || typeof item !== "object") {
							return null;
						}
						if ("name" in item && typeof item.name === "string") {
							return item.name;
						}
						return "id" in item && typeof item.id === "string" ? item.id : null;
					})
					.filter((value): value is string => value !== null)
			: [];

	return Array.from(new Set([...fromData, ...fromModels]));
};

const fetchAvailableModels = async (
	baseUrl: string,
	apiKey: string,
): Promise<Array<string>> => {
	const headers: Record<string, string> = {
		Accept: "application/json",
	};
	if (apiKey !== "") {
		headers.Authorization = `Bearer ${apiKey}`;
	}

	const endpoints = [
		joinUrl(baseUrl, "models"),
		joinUrl(baseUrl, "v1/models"),
		joinUrl(baseUrl.replace(/\/v1\/?$/, ""), "api/tags"),
	];

	const uniqueEndpoints = endpoints.filter(
		(endpoint, index) => endpoints.indexOf(endpoint) === index,
	);

	for (const endpoint of uniqueEndpoints) {
		try {
			const response = await fetch(endpoint, {
				method: "GET",
				headers,
			});
			if (!response.ok) {
				continue;
			}
			const payload = (await response.json()) as unknown;
			const models = extractModels(payload);
			if (models.length > 0) {
				return models;
			}
		} catch {
			// Try the next endpoint.
		}
	}

	return [];
};

const setupDomEnvironment = (): (() => void) => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://littlelater.test/",
	});

	const originalWindow = globalThis.window;
	const originalDocument = globalThis.document;
	const originalNavigator = globalThis.navigator;
	const originalHTMLAnchorElement = globalThis.HTMLAnchorElement;
	const originalFileReader = globalThis.FileReader;
	const originalBlob = globalThis.Blob;
	const originalLocalStorage = globalThis.localStorage;
	const originalCreateObjectURL = URL.createObjectURL;
	const originalRevokeObjectURL = URL.revokeObjectURL;
	const originalAnchorClick = dom.window.HTMLAnchorElement.prototype.click;

	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		navigator: dom.window.navigator,
		HTMLAnchorElement: dom.window.HTMLAnchorElement,
		FileReader: dom.window.FileReader,
		Blob: dom.window.Blob,
		localStorage: {
			getItem: (key: string) => storageMap.get(key) ?? null,
			setItem: (key: string, value: string) => {
				storageMap.set(key, value);
			},
			removeItem: (key: string) => {
				storageMap.delete(key);
			},
			clear: () => {
				storageMap.clear();
			},
			key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
			get length() {
				return storageMap.size;
			},
		} satisfies Storage,
	});

	dom.window.HTMLAnchorElement.prototype.click = () => {};
	URL.createObjectURL = () => `blob:live-ai-${Date.now()}-${Math.random()}`;
	URL.revokeObjectURL = () => {};

	return () => {
		dom.window.close();
		Object.assign(globalThis, {
			window: originalWindow,
			document: originalDocument,
			navigator: originalNavigator,
			HTMLAnchorElement: originalHTMLAnchorElement,
			FileReader: originalFileReader,
			Blob: originalBlob,
			localStorage: originalLocalStorage,
		});
		dom.window.HTMLAnchorElement.prototype.click = originalAnchorClick;
		URL.createObjectURL = originalCreateObjectURL;
		URL.revokeObjectURL = originalRevokeObjectURL;
	};
};

const seedTestData = async (): Promise<void> => {
	document.title = "Little Later AI Live Validation";
	localStorage.clear();
	localStorage.setItem(
		"userSettings",
		JSON.stringify({
			ai: {
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: "https://example.invalid/api/v1/ai",
				apiKey: "",
				model: DEFAULT_MODEL,
			},
			guide: {
				isFirstTimeUser: false,
			},
			misc: {
				VBMLimit: 1000,
				VBMSameOriginLimit: 1,
			},
		}),
	);

	await db.userProfileTbl.put({
		userId: 1,
		name: "Alex",
		theme: LTHEME.DARK,
		isCurrent: LINT_BOOLEAN.TRUE,
	});

	await db.noteTbl.bulkPut([
		{
			id: 1,
			content: "Project Phoenix planning notes",
			lastModificationDate: "2026-04-05T08:00:00+05:30",
		},
		{
			id: 2,
			content: "Disposable note to delete",
			lastModificationDate: "2026-04-05T08:05:00+05:30",
		},
	]);

	await db.reminderTbl.bulkPut([
		{
			id: 1,
			message: "Daily standup",
			type: LREMINDER_TYPE.NORMAL,
			targetDate: "2026-04-05T18:00:00+05:30",
			lastNotificationDate: "2026-04-05T09:00:00+05:30",
		},
		{
			id: 2,
			message: "Reminder to delete",
			type: LREMINDER_TYPE.NORMAL,
			targetDate: "2026-04-07T10:00:00+05:30",
			lastNotificationDate: "2026-04-05T09:00:00+05:30",
		},
	]);

	await db.taskTbl.bulkPut([
		{
			id: 1,
			information: "Ship AI reliability update",
			label: "Engineering",
			priority: LTASK_PRIORITY.HIGH,
			finishDate: null,
			schedule: {
				type: LTASK_SCHEDULE_TYPE.DUE,
				deadlineInfo: {
					deadlineDate: "2026-04-06T11:00:00+05:30",
				},
				recurringInfo: null,
			},
		},
		{
			id: 2,
			information: "Task to delete",
			label: "Cleanup",
			priority: LTASK_PRIORITY.LOW,
			finishDate: null,
			schedule: {
				type: LTASK_SCHEDULE_TYPE.ADHOC,
				deadlineInfo: null,
				recurringInfo: null,
			},
		},
	]);

	await db.visualBMTbl.bulkPut([
		{
			id: 47,
			customName:
				"JioHotstar - Watch TV Shows, Movies, Specials, Live Cricket & Football",
			title: "JioHotstar - Watch TV Shows, Movies, Specials, Live Cricket & Football",
			url: "https://www.hotstar.com/in/home",
			isSaved: LINT_BOOLEAN.TRUE,
			hasBrowsed: LINT_BOOLEAN.TRUE,
			lastBrowseDate: LDateUtl.getNow(),
		},
		{
			id: 48,
			customName: "Delete Me Save",
			title: "Delete Me Save",
			url: "https://delete-me.example.com",
			isSaved: LINT_BOOLEAN.TRUE,
			hasBrowsed: LINT_BOOLEAN.TRUE,
			lastBrowseDate: "2026-04-04T10:00:00+05:30",
		},
	]);

	await db.vbmPreviewTbl.put({
		vbmId: 47,
		blob: {
			type: "image/png",
			data: Array.from(new TextEncoder().encode("preview")),
		} as unknown as Blob,
	});
};

const createAI = (
	baseUrl: string,
	apiKey: string,
	model: string,
): OpenAICompatibleAIType => {
	const baseConfig = {
		model,
		provider: LAI_PROVIDERS.CUSTOM,
		apiKey,
		baseUrl,
	};

	if (!debugEnabled) {
		return new OpenAICompatibleAIClass(baseConfig);
	}

	return new (class extends OpenAICompatibleAIClass {
		protected override async createChatCompletion(
			params: Parameters<OpenAICompatibleAIType["prompt"]>[1] extends never
				? never
				: Parameters<typeof OpenAICompatibleAIClass.prototype["createChatCompletion"]>[0],
		) {
			try {
				return await super.createChatCompletion(params);
			} catch (error: unknown) {
				console.error("[live-debug] createChatCompletion error", error);
				throw error;
			}
		}

		protected override buildLLMErrorOutput(error: unknown) {
			console.error("[live-debug] normalized request error", this.toLLMRequestError(error));
			return super.buildLLMErrorOutput(error);
		}
	})(baseConfig);
};

const instrumentToolExecutions = (): ToolExecutionRecorder => {
	const executedTools: Array<string> = [];
	const restorers: Array<() => void> = [];

	for (const [toolName, definition] of liveToolRegistry.entries()) {
		const originalExecute = definition.execute;
		definition.execute = async (args, context) => {
			executedTools.push(toolName);
			return originalExecute(args, context);
		};
		restorers.push(() => {
			definition.execute = originalExecute;
		});
	}

	return {
		getExecutions: () => [...executedTools],
		restore: () => {
			for (const restore of restorers.reverse()) {
				restore();
			}
		},
	};
};

const previewMessage = (message: string): string =>
	message.replace(/\s+/g, " ").trim().slice(0, 180);

const normalizeForMatch = (value: string): string =>
	value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u2010-\u2015]/g, "-")
		.replace(/[^\p{L}\p{N}-]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim();

const includesNormalized = (message: string, needle: string): boolean =>
	normalizeForMatch(message).includes(normalizeForMatch(needle));

const scenarios: Array<Scenario> = [
	{
		name: "get_user_name",
		prompt: "Use the available tools and tell me my name.",
		expectedTools: ["get_user_name"],
		validate: (output) =>
			output.message.includes("Alex") ? null : "response did not mention Alex",
	},
	{
		name: "get_user_app_theme_pref",
		prompt: "Use the available tools and tell me which theme is active.",
		expectedTools: ["get_user_app_theme_pref"],
		validate: (output) =>
			includesNormalized(output.message, "little dark") ||
			includesNormalized(output.message, "little-dark")
				? null
				: "response did not mention the Little Dark theme",
	},
	{
		name: "set_user_app_theme_pref",
		prompt: "Use the available tools and switch my theme to little-light.",
		expectedTools: ["set_user_app_theme_pref"],
		validate: async () => {
			const currentProfile = await db.userProfileTbl.get(1);
			return currentProfile?.theme === LTHEME.LIGHT
				? null
				: "theme was not updated to little-light";
		},
	},
	{
		name: "create_note",
		prompt:
			"Use the available tools and create a note with this exact content: Launch checklist and rollout plan.",
		expectedTools: ["create_note"],
		validate: async () => {
			const notes = await db.noteTbl.toArray();
			return notes.some((note) =>
				note.content.includes("Launch checklist and rollout plan"),
			)
				? null
				: "created note was not found";
		},
	},
	{
		name: "search_notes",
		prompt:
			"Use the available tools and find the note about Project Phoenix, then answer briefly.",
		expectedTools: ["search_notes"],
		validate: (output) =>
			includesNormalized(output.message, "project phoenix")
				? null
				: "response did not mention the Project Phoenix note",
	},
	{
		name: "personal_context_note_lookup",
		prompt:
			"What am I currently working on? If you are unsure, use the available tools before answering.",
		expectedTools: ["search_notes"],
	},
	{
		name: "update_note",
		prompt:
			"Use the available tools. Find the Project Phoenix note and update it so the content becomes exactly: Project Phoenix planning notes (updated).",
		expectedTools: ["search_notes", "update_note"],
		validate: async () => {
			const note = await db.noteTbl.get(1);
			return note?.content === "Project Phoenix planning notes (updated)"
				? null
				: "note content was not updated";
		},
	},
	{
		name: "create_reminder",
		prompt:
			"Use the available tools and create a normal reminder that says Doctor appointment for April 7 2026 at 10:30 AM.",
		expectedTools: ["format_date_time", "create_reminder"],
		validate: async () => {
			const reminders = await db.reminderTbl.toArray();
			return reminders.some(
				(reminder) =>
					reminder.message === "Doctor appointment" &&
					reminder.targetDate.startsWith("2026-04-07T10:30:00"),
			)
				? null
				: "created reminder was not found with the expected time";
		},
	},
	{
		name: "search_reminders",
		prompt:
			"Use the available tools and show reminders on April 5 2026 about standup.",
		expectedTools: ["format_date_time", "search_reminders"],
		validate: (output) =>
			output.message.toLowerCase().includes("standup")
				? null
				: "response did not mention the standup reminder",
	},
	{
		name: "update_reminder",
		prompt:
			"Use the available tools. Find the Daily standup reminder and move it to April 5 2026 at 7:15 PM.",
		expectedTools: ["search_reminders", "format_date_time", "update_reminder"],
		validate: async () => {
			const reminder = await db.reminderTbl.get(1);
			return reminder?.targetDate.startsWith("2026-04-05T19:15:00")
				? null
				: "reminder targetDate was not updated";
		},
	},
	{
		name: "search_tasks",
		prompt:
			"Use the available tools and find high priority tasks due on April 6 2026.",
		expectedTools: ["format_date_time", "search_tasks"],
		validate: (output) =>
			output.message.toLowerCase().includes("ship ai reliability update")
				? null
				: "response did not mention the due task",
	},
	{
		name: "search_saves",
		prompt: "Use the available tools and find my Hotstar save.",
		expectedTools: ["search_saves"],
		validate: (output) =>
			output.message.toLowerCase().includes("hotstar")
				? null
				: "response did not mention Hotstar",
	},
	{
		name: "get_save_preview_image",
		prompt: "Use the available tools and show the preview image for my Hotstar save.",
		expectedTools: ["get_save_preview_image"],
		validate: (output) =>
			output.message.includes("![")
				? null
				: "response did not include markdown image output",
	},
	{
		name: "get_recent_history",
		prompt: "Use the available tools and show my recent browsing history.",
		expectedTools: ["get_recent_history"],
		validate: (output) =>
			output.message.toLowerCase().includes("hotstar")
				? null
				: "response did not include the history summary",
	},
	{
		name: "get_productivity_overview",
		prompt: "Use the available tools and give me a productivity overview.",
		expectedTools: ["get_productivity_overview"],
		validate: (output) =>
			(output.message.toLowerCase().includes("tasks") ||
				output.message.toLowerCase().includes("pending")) &&
			output.message.toLowerCase().includes("reminders")
				? null
				: "response did not include the overview summary",
	},
	{
		name: "multi_tool_overview_history",
		prompt:
			"Use the available tools and give me a productivity overview, then include my recent browsing history too.",
		expectedTools: ["get_productivity_overview", "get_recent_history"],
		validate: (output) =>
			(output.message.toLowerCase().includes("history") ||
				output.message.toLowerCase().includes("browsing") ||
				output.message.toLowerCase().includes("hotstar") ||
				output.message.toLowerCase().includes("jiohotstar")) &&
			(output.message.toLowerCase().includes("tasks") ||
				output.message.toLowerCase().includes("overview") ||
				output.message.toLowerCase().includes("reminders"))
				? null
				: "response did not combine overview and history",
	},
	{
		name: "export_data",
		prompt: "Use the available tools and export my data in readable format.",
		expectedTools: ["export_data"],
	},
	{
		name: "delete_note",
		prompt:
			"Use the available tools. Find the note named Disposable note to delete and delete it.",
		expectedTools: ["search_notes", "delete_note"],
		validate: async () =>
			(await db.noteTbl.get(2)) === undefined ? null : "note was not deleted",
	},
	{
		name: "delete_reminder",
		prompt:
			"Use the available tools. Find the reminder named Reminder to delete and delete it.",
		expectedTools: ["search_reminders", "delete_reminder"],
		validate: async () =>
			(await db.reminderTbl.get(2)) === undefined
				? null
				: "reminder was not deleted",
	},
	{
		name: "delete_save",
		prompt:
			"Use the available tools. Find the save named Delete Me Save and delete it.",
		expectedTools: ["search_saves", "delete_save"],
		validate: async () => {
			const save = await db.visualBMTbl.get(48);
			return save?.isSaved === LINT_BOOLEAN.FALSE
				? null
				: "save was not marked unsaved";
		},
	},
	{
		name: "delete_task",
		prompt:
			"Use the available tools. Find the task named Task to delete and delete it.",
		expectedTools: ["search_tasks", "delete_task"],
		validate: async () =>
			(await db.taskTbl.get(2)) === undefined ? null : "task was not deleted",
	},
	{
		name: "get_current_date_time_info",
		prompt: "Use the available tools and tell me the current date and time info.",
		expectedTools: ["get_current_date_time_info"],
		validate: (output) =>
			output.message.toLowerCase().includes("current date and time") ||
			output.message.toLowerCase().includes("current date") ||
			output.message.toLowerCase().includes("local zone")
				? null
				: "response did not include the current date/time payload",
	},
	{
		name: "format_date_time",
		prompt:
			"Use the available tools and format April 8 2026 9:45 AM as a Little Later datetime string.",
		expectedTools: ["format_date_time"],
		validate: (output) =>
			output.message.includes("2026-04-08T09:45:00")
				? null
				: "formatted datetime was not returned",
	},
	{
		name: "disabled_create_task",
		prompt:
			"Use the available tools. Create a high priority task to pay rent on April 8 2026 at 8 AM.",
		forbiddenTools: ["create_task", "update_task"],
		validate: (output) =>
			output.message.toLowerCase().includes("disabled") ||
			output.message.toLowerCase().includes("not supported") ||
			output.message.toLowerCase().includes("not able") ||
			output.message.toLowerCase().includes("don't have a tool") ||
			output.message.toLowerCase().includes("does not include") ||
			output.message.toLowerCase().includes("doesn't support") ||
			output.message.toLowerCase().includes("doesn’t support") ||
			output.message.toLowerCase().includes("isn't supported") ||
			output.message.toLowerCase().includes("can’t") ||
			output.message.toLowerCase().includes("can't") ||
			output.message.toLowerCase().includes("cannot") ||
			output.message.toLowerCase().includes("unable")
				? null
				: "response did not clearly refuse the disabled task creation path",
	},
	{
		name: "disabled_update_save",
		prompt:
			"Use the available tools. Rename my Hotstar save to Streaming Home.",
		forbiddenTools: ["update_save", "save_active_web_page"],
		validate: (output) =>
			output.message.toLowerCase().includes("disabled") ||
			output.message.toLowerCase().includes("not supported") ||
			output.message.toLowerCase().includes("not able") ||
			output.message.toLowerCase().includes("don't have a tool") ||
			output.message.toLowerCase().includes("does not include") ||
			output.message.toLowerCase().includes("doesn't support") ||
			output.message.toLowerCase().includes("doesn’t support") ||
			output.message.toLowerCase().includes("isn't supported") ||
			output.message.toLowerCase().includes("can’t") ||
			output.message.toLowerCase().includes("can't") ||
			output.message.toLowerCase().includes("cannot") ||
			output.message.toLowerCase().includes("unable")
				? null
				: "response did not clearly refuse the disabled save update path",
	},
];

const runScenario = async (
	scenario: Scenario,
	baseUrl: string,
	apiKey: string,
	model: string,
): Promise<ScenarioResult> => {
	await resetLLDB();
	storageMap.clear();
	await seedTestData();

	const recorder = instrumentToolExecutions();
	const progress: Array<string> = [];
	try {
		const ai = createAI(baseUrl, apiKey, model);
		const output = await ai.prompt(scenario.prompt, {
			onProgress: (event) => {
				progress.push(
					[event.stage, event.toolName, event.message].filter(Boolean).join(":"),
				);
			},
		});
		const executedTools = recorder.getExecutions();
		const expectedTools = scenario.expectedTools ?? [];
		const forbiddenTools = scenario.forbiddenTools ?? [];
		const reasons: Array<string> = [];

		const expectedExpression =
			scenario.expectExpression ?? LFACE_EXPRESSION.SLIGHTLY_SMILING;
		if (output.expression !== expectedExpression) {
			reasons.push(
				`expression was ${output.expression}, expected ${expectedExpression}`,
			);
		}

		for (const toolName of expectedTools) {
			if (!executedTools.includes(toolName)) {
				reasons.push(`missing expected tool '${toolName}'`);
			}
		}

		for (const toolName of forbiddenTools) {
			if (executedTools.includes(toolName)) {
				reasons.push(`forbidden tool '${toolName}' executed`);
			}
		}

		if (scenario.validate) {
			const validationMessage = await scenario.validate(output);
			if (validationMessage) {
				reasons.push(validationMessage);
			}
		}

		return {
			name: scenario.name,
			prompt: scenario.prompt,
			passed: reasons.length === 0,
			expectedTools,
			forbiddenTools,
			executedTools,
			expression: output.expression,
			messagePreview: previewMessage(output.message),
			progress,
			reason: reasons.join("; "),
		};
	} catch (error: unknown) {
		return {
			name: scenario.name,
			prompt: scenario.prompt,
			passed: false,
			expectedTools: scenario.expectedTools ?? [],
			forbiddenTools: scenario.forbiddenTools ?? [],
			executedTools: recorder.getExecutions(),
			expression: "runtime_error",
			messagePreview: "",
			progress,
			reason: error instanceof Error ? error.message : String(error),
		};
	} finally {
		recorder.restore();
	}
};

const run = async (): Promise<void> => {
	const baseUrl = requireEnv("AI_LIVE_CUSTOM_BASE_URL");
	const apiKey = requireEnv("AI_LIVE_CUSTOM_API_KEY");
	const model = process.env.AI_LIVE_MODEL?.trim() || DEFAULT_MODEL;
	const cleanup = setupDomEnvironment();

	try {
		({ db, resetLLDB } = await import("../src/utils/db"));
		({ OpenAICompatibleAI: OpenAICompatibleAIClass } = await import(
			"../src/services/ai/main"
		));
		({ toolRegistry: liveToolRegistry } = await import(
			"../src/services/ai/toolRegistry"
		));

		console.log(`[live] validating provider ${baseUrl}`);
		console.log(`[live] requested model ${model}`);

		const models = await fetchAvailableModels(baseUrl, apiKey);
		if (models.length === 0) {
			throw new Error("Model discovery failed: no models returned by the live provider.");
		}
		console.log(`[live] discovered ${models.length} model(s).`);
		if (!models.includes(model)) {
			console.warn(`[live] requested model was not listed by /models, continuing anyway.`);
		}

		const selectedScenarios =
			scenarioFilter === ""
				? scenarios
				: scenarios.filter(
						(scenario) =>
							scenario.name.toLowerCase().includes(scenarioFilter) ||
							scenario.prompt.toLowerCase().includes(scenarioFilter),
					);
		if (selectedScenarios.length === 0) {
			throw new Error(`No live validation scenarios matched filter: ${scenarioFilter}`);
		}

		const results: Array<ScenarioResult> = [];
		for (const scenario of selectedScenarios) {
			console.log(`\n[live] running ${scenario.name}`);
			const result = await runScenario(scenario, baseUrl, apiKey, model);
			results.push(result);
			const status = result.passed ? "PASS" : "FAIL";
			const tools =
				result.executedTools.length > 0 ? result.executedTools.join(", ") : "(none)";
			console.log(`[${status}] ${result.name}`);
			console.log(`  prompt: ${result.prompt}`);
			console.log(`  tools: ${tools}`);
			console.log(`  expression: ${result.expression}`);
			console.log(`  reply: ${result.messagePreview || "(empty)"}`);
			if (!result.passed && result.reason) {
				console.log(`  reason: ${result.reason}`);
			}
		}

		const passed = results.filter((result) => result.passed).length;
		const failed = results.length - passed;
		console.log(`\n[live] summary: ${passed}/${results.length} passed, ${failed} failed.`);

		if (failed > 0) {
			process.exitCode = 1;
		}
	} finally {
		cleanup();
	}
};

void run();
