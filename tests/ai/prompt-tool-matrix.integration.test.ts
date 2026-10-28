/* @vitest-environment node */
import "fake-indexeddb/auto";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import {
	LAI_PROVIDERS,
	LFACE_EXPRESSION,
	LREMINDER_TYPE,
	LTASK_PRIORITY,
	LTHEME,
} from "little-shared/enums";
import type { OpenAICompatibleAI as OpenAICompatibleAIClass } from "../../src/services/ai/main";
import {
	readNotes,
	readProfile,
	readReminders,
	readSaves,
	readTasks,
	unlockedKeys,
} from "../../src/services/ai/records";
import { littleDB } from "../../src/storage/pageDB";
import { putPreview } from "../../src/storage/repositories";
import { send } from "../../src/utils/send";
import { freshProfile, localDate } from "./profile";

// The export tool still writes the pre-v1 backup, whose packer needs a
// browser global; it moves to the v1 backup in its own change.
(globalThis as { self?: unknown }).self = globalThis;

let OpenAICompatibleAI: typeof OpenAICompatibleAIClass;
let registeredTools: Array<{ function: { name: string } }>;
let toolRegistry: typeof import("../../src/services/ai/toolRegistry").toolRegistry;

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

type ToolCallSpec = {
	name: string;
	args?: Record<string, unknown>;
	rawArguments?: string;
};

type PromptScenario = {
	toolCalls?: Array<ToolCallSpec>;
	httpStatus?: number;
	plainContent?: string;
	finalAssistantContent?: string;
};

type MockServerState = {
	baseUrl: string;
	close: () => Promise<void>;
	setScenarios: (scenarios: Record<string, PromptScenario>) => void;
	resetToolExecutions: () => void;
	getToolExecutionsForPrompt: (prompt: string) => Array<string>;
	getGlobalToolExecutions: () => Map<string, number>;
};

const normalizePrompt = (prompt: string): string =>
	prompt.trim().toLowerCase().replace(/\s+/g, " ");

const readBody = async (req: IncomingMessage): Promise<string> => {
	let body = "";
	for await (const chunk of req) {
		body += chunk;
	}
	return body;
};

const sendJSON = (
	res: ServerResponse,
	status: number,
	payload: unknown,
): void => {
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
	model: "mock-model",
	choices: [
		{
			index: 0,
			message,
			finish_reason: finishReason,
		},
	],
});

const getLastUserPrompt = (
	messages: Array<ChatMessage>,
): string | undefined => {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role === "user" && typeof message.content === "string") {
			return normalizePrompt(message.content);
		}
	}
	return undefined;
};

const getTrailingToolMessageCount = (messages: Array<ChatMessage>): number => {
	let count = 0;
	for (let index = messages.length - 1; index >= 0; index--) {
		if (messages[index]?.role !== "tool") {
			break;
		}
		count++;
	}
	return count;
};

const buildToolCalls = (
	specs: Array<ToolCallSpec>,
): Array<{
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}> =>
	specs.map((spec, index) => ({
		id: `tool_${index + 1}_${Date.now()}`,
		type: "function",
		function: {
			name: spec.name,
			arguments: spec.rawArguments ?? JSON.stringify(spec.args ?? {}),
		},
	}));

const createMockProviderServer = async (): Promise<MockServerState> => {
	let activeScenarios: Record<string, PromptScenario> = {};
	const executedToolsByPrompt = new Map<string, Array<string>>();
	const globalToolExecutions = new Map<string, number>();

	const server = createServer(async (req, res) => {
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
				res.statusCode = 500;
				res.end("{invalid-json");
				return;
			}

			// Semantic search helper calls use structured responses.
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

			const messages = Array.isArray(body.messages)
				? (body.messages as Array<ChatMessage>)
				: [];
			const lastMessage = messages.at(-1);

			if (lastMessage?.role === "user") {
				const prompt =
					typeof lastMessage.content === "string"
						? normalizePrompt(lastMessage.content)
						: "";
				const scenario = activeScenarios[prompt];
				if (!scenario) {
					sendJSON(
						res,
						200,
						completionPayload({
							role: "assistant",
							content: "No mapped scenario for prompt.",
						}),
					);
					return;
				}

				if (scenario.httpStatus) {
					sendJSON(res, scenario.httpStatus, {
						error: `forced_${scenario.httpStatus}`,
					});
					return;
				}

				if (scenario.toolCalls && scenario.toolCalls.length > 0) {
					sendJSON(
						res,
						200,
						completionPayload(
							{
								role: "assistant",
								content: null,
								tool_calls: buildToolCalls(scenario.toolCalls),
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
						content:
							scenario.plainContent ??
							"Scenario finished without tool calls.",
					}),
				);
				return;
			}

			if (lastMessage?.role === "tool") {
				const prompt = getLastUserPrompt(messages);
				const trailingToolCount = getTrailingToolMessageCount(messages);
				const assistantIndex = messages.length - trailingToolCount - 1;
				const assistantMessage = messages[assistantIndex];
				if (prompt && assistantMessage?.role === "assistant") {
					const executedToolNames = Array.isArray(
						assistantMessage.tool_calls,
					)
						? assistantMessage.tool_calls
								.map((toolCall) => toolCall?.function?.name)
								.filter(
									(toolName): toolName is string =>
										typeof toolName === "string" &&
										toolName.trim() !== "",
								)
						: [];
					if (executedToolNames.length > 0) {
						const promptExecutions =
							executedToolsByPrompt.get(prompt) ?? [];
						promptExecutions.push(...executedToolNames);
						executedToolsByPrompt.set(prompt, promptExecutions);
						for (const toolName of executedToolNames) {
							globalToolExecutions.set(
								toolName,
								(globalToolExecutions.get(toolName) ?? 0) + 1,
							);
						}
					}
				}

				const scenario = prompt ? activeScenarios[prompt] : undefined;
				sendJSON(
					res,
					200,
					completionPayload({
						role: "assistant",
						content: scenario?.finalAssistantContent ?? "",
					}),
				);
				return;
			}

			sendJSON(
				res,
				200,
				completionPayload({
					role: "assistant",
					content: "Fallback completion.",
				}),
			);
			return;
		}

		res.statusCode = 404;
		res.end("Not Found");
	});

	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address() as AddressInfo;

	return {
		baseUrl: `http://127.0.0.1:${address.port}`,
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
		setScenarios: (scenarios) => {
			activeScenarios = scenarios;
		},
		resetToolExecutions: () => {
			executedToolsByPrompt.clear();
			globalToolExecutions.clear();
		},
		getToolExecutionsForPrompt: (prompt) =>
			executedToolsByPrompt.get(normalizePrompt(prompt)) ?? [],
		getGlobalToolExecutions: () => new Map(globalToolExecutions),
	};
};

const createScenarioRecord = (
	scenarios: Array<{
		prompt: string;
		scenario: PromptScenario;
	}>,
): Record<string, PromptScenario> => {
	const result: Record<string, PromptScenario> = {};
	for (const { prompt, scenario } of scenarios) {
		result[normalizePrompt(prompt)] = scenario;
	}
	return result;
};

type Seeded = {
	phoenixNote: string;
	disposableNote: string;
	standupReminder: string;
	disposableReminder: string;
	shipTask: string;
	disposableTask: string;
	hotstarSave: string;
	disposableSave: string;
};

const seedTestData = async (): Promise<Seeded> => {
	await freshProfile();
	await send("profile.update", { theme: "dark" });

	const phoenixNote = await send("note.create", {
		content: "Project Phoenix planning notes",
	});
	const disposableNote = await send("note.create", {
		content: "Disposable note to delete",
	});

	const standupReminder = await send("reminder.create", {
		message: "Daily standup",
		target: Date.parse(localDate("2026-04-05T18:00:00")),
	});
	const disposableReminder = await send("reminder.create", {
		message: "Reminder to delete",
		target: Date.parse(localDate("2026-04-07T10:00:00")),
	});

	const shipTask = await send("task.create", {
		information: "Ship AI reliability update",
		label: "Engineering",
		priority: "high",
		schedule: {
			kind: "due",
			at: Date.parse(localDate("2026-04-06T11:00:00")),
		},
		reminder: null,
	});
	const disposableTask = await send("task.create", {
		information: "Task to delete",
		label: "Cleanup",
		priority: "low",
		schedule: { kind: "anytime" },
		reminder: null,
	});

	const hotstarSave = await send("save.capture", {
		url: "https://www.hotstar.com/in/home",
		title: "JioHotstar - Watch TV Shows, Movies, Specials, Live Cricket & Football",
		saved: true,
	});
	await putPreview(
		littleDB,
		await unlockedKeys(),
		hotstarSave.id,
		new TextEncoder().encode("preview"),
		Date.now(),
	);
	const disposableSave = await send("save.capture", {
		url: "https://delete-me.example.com/",
		title: "Delete Me Save",
		saved: true,
	});

	return {
		phoenixNote: phoenixNote.id,
		disposableNote: disposableNote.id,
		standupReminder: standupReminder.id,
		disposableReminder: disposableReminder.id,
		shipTask: shipTask.id,
		disposableTask: disposableTask.id,
		hotstarSave: hotstarSave.id,
		disposableSave: disposableSave.id,
	};
};

const createAI = (baseUrl: string): OpenAICompatibleAIClass =>
	new OpenAICompatibleAI({
		model: "mock-model",
		provider: LAI_PROVIDERS.CUSTOM,
		apiKey: "",
		baseUrl: `${baseUrl}/v1`,
	});

const instrumentToolExecutions = () => {
	const executedToolsByPrompt = new Map<string, Array<string>>();
	let activePrompt: string | null = null;
	const restorers: Array<() => void> = [];

	for (const [toolName, definition] of toolRegistry.entries()) {
		const originalExecute = definition.execute;
		definition.execute = async (args, context) => {
			if (activePrompt) {
				const existing = executedToolsByPrompt.get(activePrompt) ?? [];
				existing.push(toolName);
				executedToolsByPrompt.set(activePrompt, existing);
			}
			return originalExecute(args, context);
		};
		restorers.push(() => {
			definition.execute = originalExecute;
		});
	}

	return {
		setActivePrompt: (prompt: string | null) => {
			activePrompt = prompt ? normalizePrompt(prompt) : null;
		},
		getToolExecutionsForPrompt: (prompt: string) =>
			executedToolsByPrompt.get(normalizePrompt(prompt)) ?? [],
		getGlobalToolExecutions: () => {
			const counts = new Map<string, number>();
			for (const toolNames of executedToolsByPrompt.values()) {
				for (const toolName of toolNames) {
					counts.set(toolName, (counts.get(toolName) ?? 0) + 1);
				}
			}
			return counts;
		},
		restore: () => {
			for (const restore of restorers.reverse()) {
				restore();
			}
		},
	};
};

describe("ai prompt tool matrix coverage", { concurrent: false }, () => {
	let mockServer: MockServerState;
	let seeded: Seeded;

	beforeAll(async () => {
		mockServer = await createMockProviderServer();
		({ OpenAICompatibleAI } = await import("../../src/services/ai/main"));
		({ tools: registeredTools, toolRegistry } =
			await import("../../src/services/ai/toolRegistry"));
	});

	afterAll(async () => {
		await mockServer.close();
	});

	beforeEach(async () => {
		// The April dates below stay in the future.
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-04-01T00:00:00Z"));
		vi.stubGlobal("chrome", {
			runtime: {},
			tabs: {
				query: (
					_query: unknown,
					callback: (
						tabs: Array<{ url: string; title: string }>,
					) => void,
				) =>
					callback([
						{
							url: "https://littlelater.test/",
							title: "Little Later AI Test Page",
						},
					]),
			},
		});
		mockServer.resetToolExecutions();
		seeded = await seedTestData();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("covers every exposed AI tool with prompt-driven scenarios", async () => {
		const promptMatrix = [
			{
				prompt: "Who am I?",
				expectedTool: "get_user_name",
				expectedMessage: "Your name is",
				scenario: {
					toolCalls: [{ name: "get_user_name" }],
				} satisfies PromptScenario,
			},
			{
				prompt: "What theme is active?",
				expectedTool: "get_user_app_theme_pref",
				expectedMessage: "Your app theme is",
				scenario: {
					toolCalls: [{ name: "get_user_app_theme_pref" }],
				} satisfies PromptScenario,
			},
			{
				prompt: "Switch my theme to light.",
				expectedTool: "set_user_app_theme_pref",
				expectedMessage: "Theme updated",
				scenario: {
					toolCalls: [
						{
							name: "set_user_app_theme_pref",
							args: { theme: LTHEME.LIGHT },
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Create launch note.",
				expectedTool: "create_note",
				expectedMessage: "Created note",
				scenario: {
					toolCalls: [
						{
							name: "create_note",
							args: {
								content: "Launch checklist and rollout plan",
							},
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Find launch note.",
				expectedTool: "search_notes",
				expectedMessage: "Found",
				scenario: {
					toolCalls: [
						{
							name: "search_notes",
							args: {
								query: "launch checklist",
							},
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Update note one.",
				expectedTool: "update_note",
				expectedMessage: "Updated note",
				scenario: {
					toolCalls: [
						{
							name: "update_note",
							args: {
								id: seeded.phoenixNote,
								content:
									"Project Phoenix planning notes (updated)",
							},
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Create reminder for Tuesday morning.",
				expectedTool: "create_reminder",
				expectedMessage: "Created reminder",
				scenario: {
					toolCalls: [
						{
							name: "create_reminder",
							args: {
								message: "Doctor appointment",
								targetDate: localDate("2026-04-07T10:30:00"),
								type: LREMINDER_TYPE.NORMAL,
							},
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Search reminders for April fifth standup.",
				expectedTool: "search_reminders",
				expectedMessage: "Found",
				scenario: {
					toolCalls: [
						{
							name: "search_reminders",
							args: {
								query: "standup",
								targetDate: localDate("2026-04-05T00:00:00"),
								targetDateCriteria: {
									year: true,
									month: true,
									day: true,
								},
							},
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Update reminder one.",
				expectedTool: "update_reminder",
				expectedMessage: "Updated reminder",
				scenario: {
					toolCalls: [
						{
							name: "update_reminder",
							args: {
								id: seeded.standupReminder,
								message: "Daily standup moved",
								targetDate: localDate("2026-04-05T19:15:00"),
								type: LREMINDER_TYPE.NORMAL,
							},
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Search high priority tasks due on April sixth.",
				expectedTool: "search_tasks",
				expectedMessage: "Found",
				scenario: {
					toolCalls: [
						{
							name: "search_tasks",
							args: {
								priority: LTASK_PRIORITY.HIGH,
								deadlineDate: localDate("2026-04-06T00:00:00"),
								deadlineDateCriteria: {
									year: true,
									month: true,
									day: true,
								},
							},
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Create a high priority rent task.",
				expectedTool: "create_task",
				expectedMessage: "Created task",
				scenario: {
					toolCalls: [
						{
							name: "create_task",
							args: {
								information: "Pay rent",
								label: "Rent",
								priority: LTASK_PRIORITY.HIGH,
								deadlineDate: localDate("2026-04-08T08:00:00"),
							},
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Update task one label.",
				expectedTool: "update_task",
				expectedMessage: "Updated task",
				scenario: {
					toolCalls: [
						{
							name: "update_task",
							args: {
								id: seeded.shipTask,
								label: "Engineering updated",
							},
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Save the current page.",
				expectedTool: "save_active_web_page",
				expectedMessage: "Saved the current page",
				scenario: {
					toolCalls: [{ name: "save_active_web_page" }],
				} satisfies PromptScenario,
			},
			{
				prompt: "Rename save forty seven.",
				expectedTool: "update_save",
				expectedMessage: "Updated save",
				scenario: {
					toolCalls: [
						{
							name: "update_save",
							args: {
								id: seeded.hotstarSave,
								customName: "Streaming Home",
							},
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Format datetime sample for me.",
				expectedTool: "format_date_time",
				expectedMessage: "Formatted datetime:",
				scenario: {
					toolCalls: [
						{
							name: "format_date_time",
							args: {
								year: 2026,
								month: 4,
								day: 8,
								hour: 9,
								minute: 45,
								second: 0,
							},
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "What is current date and time details?",
				expectedTool: "get_current_date_time_info",
				expectedMessage: "Latest Date & Time Information:",
				scenario: {
					toolCalls: [{ name: "get_current_date_time_info" }],
				} satisfies PromptScenario,
			},
			{
				prompt: "Find my Hotstar save.",
				expectedTool: "search_saves",
				expectedMessage: "Found",
				scenario: {
					toolCalls: [
						{
							name: "search_saves",
							args: { query: "hotstar" },
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Show hotstar preview image.",
				expectedTool: "get_save_preview_image",
				expectedMessage: "Preview for",
				scenario: {
					toolCalls: [
						{
							name: "get_save_preview_image",
							args: { query: "hotstar" },
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Get recent browsing history.",
				expectedTool: "get_recent_history",
				expectedMessage: "Found",
				scenario: {
					toolCalls: [
						{
							name: "get_recent_history",
							args: { limit: 5 },
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Get productivity overview now.",
				expectedTool: "get_productivity_overview",
				expectedMessage: "Overview:",
				scenario: {
					toolCalls: [{ name: "get_productivity_overview" }],
				} satisfies PromptScenario,
			},
			{
				prompt: "Delete note two.",
				expectedTool: "delete_note",
				expectedMessage: "Deleted the note.",
				scenario: {
					toolCalls: [
						{
							name: "delete_note",
							args: { id: seeded.disposableNote },
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Delete reminder two.",
				expectedTool: "delete_reminder",
				expectedMessage: "Deleted the reminder.",
				scenario: {
					toolCalls: [
						{
							name: "delete_reminder",
							args: { id: seeded.disposableReminder },
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Delete save forty eight.",
				expectedTool: "delete_save",
				expectedMessage: "Deleted the save.",
				scenario: {
					toolCalls: [
						{
							name: "delete_save",
							args: { id: seeded.disposableSave },
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Delete task two.",
				expectedTool: "delete_task",
				expectedMessage: "Deleted the task.",
				scenario: {
					toolCalls: [
						{
							name: "delete_task",
							args: { id: seeded.disposableTask },
						},
					],
				} satisfies PromptScenario,
			},
		] as const;

		mockServer.setScenarios(
			createScenarioRecord(
				promptMatrix.map((item) => ({
					prompt: item.prompt,
					scenario: item.scenario,
				})),
			),
		);

		const ai = createAI(mockServer.baseUrl);
		const toolExecutionSpy = instrumentToolExecutions();

		try {
			for (const item of promptMatrix) {
				toolExecutionSpy.setActivePrompt(item.prompt);
				const output = await ai.prompt(item.prompt);
				let finalOutput = output;
				if (output.confirmation) {
					expect(output.message).toContain(
						"I need your confirmation",
					);
					expect(
						output.confirmation.items.some(
							(entry) => entry.toolName === item.expectedTool,
						),
					).toBe(true);
					finalOutput = await ai.confirmPendingMutations();
				}
				toolExecutionSpy.setActivePrompt(null);
				expect(
					finalOutput.expression,
					`Prompt failed: "${item.prompt}" with message "${finalOutput.message}"`,
				).toBe(LFACE_EXPRESSION.SLIGHTLY_SMILING);
				expect(finalOutput.message).toContain(item.expectedMessage);

				const executedForPrompt =
					toolExecutionSpy.getToolExecutionsForPrompt(item.prompt);
				expect(executedForPrompt).toContain(item.expectedTool);
			}
		} finally {
			toolExecutionSpy.setActivePrompt(null);
			toolExecutionSpy.restore();
		}

		const executions = toolExecutionSpy.getGlobalToolExecutions();
		const exposedToolNames = registeredTools
			.map((tool) => tool.function.name)
			// Covered again once it writes the v1 backup.
			.filter((toolName) => toolName !== "export_data")
			.sort();
		expect(exposedToolNames.length).toBeGreaterThan(0);
		for (const toolName of exposedToolNames) {
			expect(
				executions.get(toolName) ?? 0,
				`Tool '${toolName}' should be executed at least once`,
			).toBeGreaterThan(0);
		}

		const keys = await unlockedKeys();
		const notes = await readNotes(keys);
		const reminders = await readReminders(keys);
		const saves = await readSaves(keys);
		const tasks = await readTasks(keys);
		const byId = <T extends { id: string }>(rows: Array<T>, id: string) =>
			rows.find((row) => row.id === id);
		expect(byId(notes, seeded.phoenixNote)?.content).toContain("updated");
		expect(byId(reminders, seeded.standupReminder)?.message).toContain(
			"moved",
		);
		expect(byId(notes, seeded.disposableNote)).toBeUndefined();
		expect(byId(reminders, seeded.disposableReminder)).toBeUndefined();
		expect(byId(saves, seeded.disposableSave)?.saved).toBe(false);
		expect(byId(tasks, seeded.disposableTask)).toBeUndefined();
		expect((await readProfile(keys)).prefs.theme).toBe("light");
		expect(byId(tasks, seeded.shipTask)?.label).toBe("Engineering updated");
		expect(byId(saves, seeded.hotstarSave)?.customName).toBe(
			"Streaming Home",
		);
		expect(
			saves.some(
				(save) =>
					save.url === "https://littlelater.test/" && save.saved,
			),
		).toBe(true);
	});

	it("does not mutate data when the user cancels confirmation", async () => {
		mockServer.setScenarios(
			createScenarioRecord([
				{
					prompt: "Create a cancelled note.",
					scenario: {
						toolCalls: [
							{
								name: "create_note",
								args: { content: "Should not persist" },
							},
						],
					},
				},
			]),
		);
		const ai = createAI(mockServer.baseUrl);
		const output = await ai.prompt("Create a cancelled note.");
		expect(output.confirmation).toBeDefined();
		expect(ai.hasPendingConfirmation()).toBe(true);
		expect(
			(await readNotes(await unlockedKeys())).some(
				(note) => note.content === "Should not persist",
			),
		).toBe(false);

		const blocked = await ai.prompt("Who am I?");
		expect(blocked.message).toContain("Confirm or cancel");

		const cancelled = await ai.cancelPendingMutations();
		expect(cancelled.message).toContain("Cancelled");
		expect(ai.hasPendingConfirmation()).toBe(false);
		expect(
			(await readNotes(await unlockedKeys())).some(
				(note) => note.content === "Should not persist",
			),
		).toBe(false);
	});

	it("covers prompt-driven failure scenarios for tools and provider errors", async () => {
		const edgePromptMatrix = [
			{
				prompt: "Fail create reminder with invalid date.",
				expectedMessage:
					"targetDate must be in YYYY-MM-DDTHH:mm:ssZ format.",
				scenario: {
					toolCalls: [
						{
							name: "create_reminder",
							args: {
								message: "Invalid reminder",
								targetDate: "tomorrow evening",
							},
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Fail update reminder with invalid date.",
				expectedMessage:
					"targetDate must be in YYYY-MM-DDTHH:mm:ssZ format.",
				scenario: {
					toolCalls: [
						{
							name: "update_reminder",
							args: {
								id: seeded.standupReminder,
								targetDate: "next week",
							},
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Fail malformed create note args.",
				expectedMessage: "content is required.",
				scenario: {
					toolCalls: [
						{
							name: "create_note",
							rawArguments: "{",
						},
					],
				} satisfies PromptScenario,
			},
			{
				prompt: "Fail unknown tool usage.",
				expectedMessage: "Tool 'unknown_tool' is not supported.",
				scenario: {
					toolCalls: [{ name: "unknown_tool", args: {} }],
				} satisfies PromptScenario,
			},
			{
				prompt: "Provider should return 401.",
				expectedMessage:
					"Authentication failed (401). Check your API key in AI Settings.",
				scenario: {
					httpStatus: 401,
				} satisfies PromptScenario,
			},
			{
				prompt: "Provider should return 403.",
				expectedMessage:
					"Request rejected (403). Verify provider permissions and credentials.",
				scenario: {
					httpStatus: 403,
				} satisfies PromptScenario,
			},
			{
				prompt: "Provider should return 429.",
				expectedMessage:
					"Rate limit hit (429). Please retry in a moment.",
				scenario: {
					httpStatus: 429,
				} satisfies PromptScenario,
			},
			{
				prompt: "Provider should return 500.",
				expectedMessage:
					"AI provider is temporarily unavailable. Please try again soon.",
				scenario: {
					httpStatus: 500,
				} satisfies PromptScenario,
			},
		] as const;

		mockServer.setScenarios(
			createScenarioRecord(
				edgePromptMatrix.map((item) => ({
					prompt: item.prompt,
					scenario: item.scenario,
				})),
			),
		);

		const ai = createAI(mockServer.baseUrl);

		for (const item of edgePromptMatrix) {
			const output = await ai.prompt(item.prompt);
			const finalOutput = output.confirmation
				? await ai.confirmPendingMutations()
				: output;
			expect(
				finalOutput.expression,
				`Prompt failed: "${item.prompt}" with message "${finalOutput.message}"`,
			).toBe(LFACE_EXPRESSION.FROWNING);
			expect(finalOutput.message).toContain(item.expectedMessage);
		}
	}, 15000);
});
