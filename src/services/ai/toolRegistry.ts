import OpenAI from "openai";
import {
	LEXPORT_TYPE,
	LFACE_EXPRESSION,
	LREMINDER_TYPE,
	LTASK_PRIORITY,
	LTHEME,
} from "little-shared/enums";
import { LDate } from "little-shared/types";
import {
	LMAX_REMINDER_MESSAGE_LENGTH,
	LMAX_TASK_INFORMATION_LENGTH,
	LMAX_TASK_LABEL_LENGTH,
} from "little-shared/constants";
import type { Note, Reminder, Save, Task } from "../../storage/repositories";
import type { LinkRow, TaskSchedule } from "../../storage/schema";
import { linkedTo, reminderKind } from "../../popup/records";
import { prettyRule } from "../../utils/dates";
import { send } from "../../utils/send";
import {
	readLinks,
	readNotes,
	readReminders,
	readSaves,
	readTasks,
	unlockedKeys,
} from "./records";
import { ResponseFormatJSONSchema } from "openai/resources.mjs";
import toolCalls from "./toolCalls";
import {
	isValidLDateString,
	LDateMatchCriteria,
	normalizeDateMatchCriteria,
	toModelDate,
} from "./toolCalls/_utils/dateFilters";
import tools, {
	createNoteTool,
	createReminderTool,
	createTaskTool,
	deleteNoteTool,
	deleteReminderTool,
	deleteSaveTool,
	deleteTaskTool,
	exportDataTool,
	formatDateTimeTool,
	getCurrentDateTimeInfoTool,
	getProductivityOverviewTool,
	getRecentHistoryTool,
	getSavePreviewImageTool,
	getUserAppThemePrefTool,
	getUserNameTool,
	saveActiveWebPageTool,
	searchNotesTool,
	searchRemindersTool,
	searchSavesTool,
	searchTasksTool,
	setUserAppThemePrefTool,
	updateNoteTool,
	updateReminderTool,
	updateSaveTool,
	updateTaskTool,
} from "./tools";

type StructuredResponseProvider = {
	getStructuredResponse(
		prompt: string,
		jsonSchema?: ResponseFormatJSONSchema.JSONSchema,
		jsonObjectSchema?: string,
	): Promise<unknown>;
};

// Records a tool found, for the chat to use as context.
type AIOutputContent = {
	saves: Array<Save>;
	reminders: Array<Reminder>;
	tasks: Array<Task>;
	notes: Array<Note>;
};

type ToolExecutionContext = {
	ai: StructuredResponseProvider;
};

type ToolUndoAction = {
	label: string;
	run: () => Promise<void>;
};

type ToolExecutionResult = {
	message?: string;
	modelMessage?: string;
	modelPayload?: unknown;
	expression?: LFACE_EXPRESSION;
	content?: AIOutputContent;
	undoAction?: ToolUndoAction;
};

type ToolSafetyMetadata = {
	kind: "read" | "mutate" | "destructive" | "external";
	undoable: boolean;
};

type ToolDefinition = {
	tool: OpenAI.Chat.Completions.ChatCompletionTool;
	safety?: ToolSafetyMetadata;
	normalizeArgs: (args: Record<string, unknown>) => Record<string, unknown>;
	execute: (
		args: Record<string, unknown>,
		context: ToolExecutionContext,
	) => Promise<ToolExecutionResult>;
};

const escapeMarkdownText = (value: string): string =>
	value.replace(/[\\`*_{}[\]()<>#+!|~-]/g, "\\$&").replace(/\s+/g, " ");

const createEmptyOutputContent = (): AIOutputContent => ({
	saves: [],
	reminders: [],
	tasks: [],
	notes: [],
});

const asString = (value: unknown): string | undefined =>
	typeof value === "string" ? value : undefined;

const asTrimmedString = (value: unknown): string | undefined => {
	const asText = asString(value);
	if (!asText) {
		return undefined;
	}
	const trimmed = asText.trim();
	return trimmed === "" ? undefined : trimmed;
};

const clampText = (
	value: string | undefined,
	maxLength: number,
): string | undefined => {
	if (value === undefined) {
		return undefined;
	}
	return value.length > maxLength ? value.slice(0, maxLength) : value;
};

const asInteger = (value: unknown): number | undefined => {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.trunc(value);
	}
	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return undefined;
};

const asDateString = (value: unknown): LDate | undefined => {
	const asText = asTrimmedString(value);
	if (!asText || !isValidLDateString(asText)) {
		return undefined;
	}
	return asText;
};

const asDateCriteria = (value: unknown): LDateMatchCriteria | undefined =>
	normalizeDateMatchCriteria(value);

const asEnum = <T extends string>(
	value: unknown,
	allowed: ReadonlyArray<T>,
): T | undefined => {
	if (typeof value !== "string") {
		return undefined;
	}
	return allowed.includes(value as T) ? (value as T) : undefined;
};

const SCHEDULE_KINDS: ReadonlyArray<TaskSchedule["kind"]> = [
	"anytime",
	"due",
	"recurring",
];

// "ad-hoc" is what tasks without a deadline were called before format v1.
const asScheduleKind = (value: unknown): TaskSchedule["kind"] | undefined =>
	value === "ad-hoc" ? "anytime" : asEnum(value, SCHEDULE_KINDS);

// Undoing a delete recreates the record through commands, so it comes back
// with a new id, and with its links.

const relink = async (
	fromId: string,
	targetIds: ReadonlyArray<string>,
): Promise<void> => {
	for (const toId of targetIds) {
		await send("link.create", { fromId, toId });
	}
};

const snapshot = async () => {
	const keys = await unlockedKeys();
	const [links, notes, reminders, saves, tasks] = await Promise.all([
		readLinks(keys),
		readNotes(keys),
		readReminders(keys),
		readSaves(keys),
		readTasks(keys),
	]);
	return { links, notes, reminders, saves, tasks };
};

const targetsOf = (links: ReadonlyArray<LinkRow>, id: string) =>
	links.filter((link) => link.fromId === id).map((link) => link.toId);

const captureDeleteNoteUndo = async (
	id: string,
): Promise<ToolUndoAction | undefined> => {
	const { links, notes } = await snapshot();
	const note = notes.find((item) => item.id === id);
	if (!note) {
		return undefined;
	}
	const [saveId, ...otherSaveIds] = targetsOf(links, id);
	return {
		label: "Delete note",
		run: async () => {
			const created = await send("note.create", {
				content: note.content,
				saveId,
			});
			await relink(created.id, otherSaveIds);
		},
	};
};

const captureDeleteReminderUndo = async (
	id: string,
): Promise<ToolUndoAction | undefined> => {
	const { links, reminders } = await snapshot();
	const reminder = reminders.find((item) => item.id === id);
	if (!reminder) {
		return undefined;
	}
	const targetIds = targetsOf(links, id);
	return {
		label: "Delete reminder",
		run: async () => {
			const created = await send("reminder.create", {
				message: reminder.message,
				target: reminder.target,
				escalate: reminder.escalation !== null,
			});
			await relink(created.id, targetIds);
		},
	};
};

// Deleting a save unsaves it, which detaches its notes, tasks and
// reminders; undo saves it again and reattaches them.
const captureDeleteSaveUndo = async (
	id: string,
): Promise<ToolUndoAction | undefined> => {
	const { links, saves } = await snapshot();
	if (!saves.some((save) => save.id === id && save.saved)) {
		return undefined;
	}
	const sourceIds = links
		.filter((link) => link.toId === id)
		.map((link) => link.fromId);
	return {
		label: "Delete save",
		run: async () => {
			await send("save.update", { id, saved: true });
			for (const fromId of sourceIds) {
				await send("link.create", { fromId, toId: id });
			}
		},
	};
};

// A task's own reminder is deleted with it and comes back with it.
const captureDeleteTaskUndo = async (
	id: string,
): Promise<ToolUndoAction | undefined> => {
	const { links, reminders, tasks } = await snapshot();
	const task = tasks.find((item) => item.id === id);
	if (!task) {
		return undefined;
	}
	const [reminder] = linkedTo(links, id, reminders);
	const saveIds = targetsOf(links, id);
	return {
		label: "Delete task",
		run: async () => {
			const created = await send("task.create", {
				information: task.information,
				label: task.label,
				priority: task.priority,
				schedule: task.schedule,
				reminder:
					reminder && task.schedule.kind !== "anytime"
						? reminderKind(reminder)
						: null,
			});
			await relink(created.id, saveIds);
			if (task.done) {
				await send("task.complete", { id: created.id });
			}
		},
	};
};

const requireString = (value: unknown, fieldName: string): string => {
	const output = asTrimmedString(value);
	if (!output) {
		throw new Error(`${fieldName} is required.`);
	}
	return output;
};

const requireValidDateString = (value: unknown, fieldName: string): LDate => {
	const dateValue = asDateString(value);
	if (!dateValue) {
		throw new Error(`${fieldName} must be in YYYY-MM-DDTHH:mm:ssZ format.`);
	}
	return dateValue;
};

const asId = (value: unknown): string | undefined =>
	typeof value === "number" ? String(value) : asTrimmedString(value);

const requireId = (value: unknown): string => {
	const id = asId(value);
	if (id === undefined) {
		throw new Error("id is required.");
	}
	return id;
};

const requireInteger = (value: unknown, fieldName: string): number => {
	const output = asInteger(value);
	if (output === undefined) {
		throw new Error(`${fieldName} is required.`);
	}
	return output;
};

const summarizeInlineText = (value: string, maxLength = 80): string => {
	const normalized = value.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
};

const deriveNoteLabel = (content: string): string => {
	const firstNonEmptyLine =
		content
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line !== "") ?? "Untitled note";
	return summarizeInlineText(firstNonEmptyLine, 64);
};

const temporalSuffixPattern =
	/\s+(?:for|on)\s+(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}-\d{2}-\d{2}|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday).*/i;

const sanitizeReminderMessage = (value: string, targetDate?: LDate): string => {
	const normalized = value.replace(/\s+/g, " ").trim();
	if (normalized === "" || !targetDate) {
		return normalized;
	}
	if (!temporalSuffixPattern.test(normalized)) {
		return normalized;
	}
	const stripped = normalized.replace(temporalSuffixPattern, "").trim();
	return stripped.length >= 3 ? stripped : normalized;
};

const toModelNote = (note: Note) => ({
	id: note.id,
	content: note.content,
	lastModificationDate: toModelDate(note.updatedAt),
});

const toModelSave = (save: Save) => ({
	id: save.id,
	name: save.customName,
	title: save.title,
	url: save.url,
	lastBrowseDate: toModelDate(save.browsedAt),
	isSaved: save.saved,
});

const toModelReminder = (reminder: Reminder) => ({
	id: reminder.id,
	message: reminder.message,
	targetDate: toModelDate(reminder.target),
	type: reminderKind(reminder),
	lastNotificationDate:
		reminder.lastFiredAt === 0 ? null : toModelDate(reminder.lastFiredAt),
});

const toModelSchedule = (schedule: TaskSchedule) => {
	switch (schedule.kind) {
		case "anytime":
			return { type: "anytime" };
		case "due":
			return { type: "due", deadlineDate: toModelDate(schedule.at) };
		case "recurring":
			return { type: "recurring", rule: prettyRule(schedule.rule) };
	}
};

const toModelTask = (task: Task) => ({
	id: task.id,
	label: task.label,
	information: task.information,
	priority: task.priority,
	schedule: toModelSchedule(task.schedule),
	deadlineDate: task.dueAt === 0 ? null : toModelDate(task.dueAt),
	finished: task.done,
	finishDate: task.finishedAt === 0 ? null : toModelDate(task.finishedAt),
});

const SAFETY = {
	read: {
		kind: "read",
		undoable: false,
	} as ToolSafetyMetadata,
	mutate: {
		kind: "mutate",
		undoable: false,
	} as ToolSafetyMetadata,
	destructive: {
		kind: "destructive",
		undoable: true,
	} as ToolSafetyMetadata,
	external: {
		kind: "external",
		undoable: false,
	} as ToolSafetyMetadata,
};

const toolDefinitions: Array<ToolDefinition> = [
	{
		tool: createNoteTool,
		safety: SAFETY.mutate,
		normalizeArgs: (args) => ({
			content:
				asTrimmedString(args.content) ??
				asTrimmedString(args.message) ??
				asTrimmedString(args.text),
		}),
		execute: async (args) => {
			const content = requireString(args.content, "content");
			const action = await toolCalls.createNote({ content });
			await action();
			const noteLabel = deriveNoteLabel(content);
			return {
				message: `Created note "${noteLabel}".`,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: createReminderTool,
		safety: SAFETY.mutate,
		normalizeArgs: (args) => {
			const targetDateInput = asTrimmedString(args.targetDate);
			const targetDate = asDateString(targetDateInput);
			const rawMessage = clampText(
				asTrimmedString(args.message) ??
					asTrimmedString(args.content) ??
					asTrimmedString(args.text),
				LMAX_REMINDER_MESSAGE_LENGTH,
			);
			return {
				message: rawMessage
					? sanitizeReminderMessage(rawMessage, targetDate)
					: rawMessage,
				targetDate,
				targetDateInvalid:
					targetDateInput !== undefined && targetDate === undefined,
				type:
					asEnum(args.type, [
						LREMINDER_TYPE.NORMAL,
						LREMINDER_TYPE.ESCALATING,
					]) ?? LREMINDER_TYPE.NORMAL,
			};
		},
		execute: async (args) => {
			if (args.targetDateInvalid === true) {
				throw new Error(
					"targetDate must be in YYYY-MM-DDTHH:mm:ssZ format.",
				);
			}
			if (args.targetDate === undefined) {
				throw new Error("targetDate is required.");
			}
			const targetDate = requireValidDateString(
				args.targetDate,
				"targetDate",
			);
			const message = sanitizeReminderMessage(
				requireString(args.message, "message"),
				targetDate,
			);
			const type =
				asEnum(args.type, [
					LREMINDER_TYPE.NORMAL,
					LREMINDER_TYPE.ESCALATING,
				]) ?? LREMINDER_TYPE.NORMAL;
			const action = await toolCalls.createReminder({
				message,
				targetDate,
				type,
			});
			await action();
			return {
				message: `Created reminder "${message}" for ${targetDate}.`,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: createTaskTool,
		safety: SAFETY.mutate,
		normalizeArgs: (args) => {
			const deadlineDateInput = asTrimmedString(args.deadlineDate);
			const deadlineDate = asDateString(deadlineDateInput);
			return {
				information: clampText(
					asTrimmedString(args.information) ??
						asTrimmedString(args.message) ??
						asTrimmedString(args.text),
					LMAX_TASK_INFORMATION_LENGTH,
				),
				label: clampText(
					asTrimmedString(args.label),
					LMAX_TASK_LABEL_LENGTH,
				),
				priority: asEnum(args.priority, [
					LTASK_PRIORITY.LOW,
					LTASK_PRIORITY.MEDIUM,
					LTASK_PRIORITY.HIGH,
				]),
				deadlineDate,
				deadlineDateInvalid:
					deadlineDateInput !== undefined &&
					deadlineDate === undefined,
			};
		},
		execute: async (args) => {
			if (args.deadlineDateInvalid === true) {
				throw new Error(
					"deadlineDate must be in YYYY-MM-DDTHH:mm:ssZ format.",
				);
			}
			const information = requireString(args.information, "information");
			const label =
				asTrimmedString(args.label) ??
				summarizeInlineText(information, 20);
			const priority =
				asEnum(args.priority, [
					LTASK_PRIORITY.LOW,
					LTASK_PRIORITY.MEDIUM,
					LTASK_PRIORITY.HIGH,
				]) ?? LTASK_PRIORITY.LOW;
			const deadlineDate = asDateString(args.deadlineDate);
			const action = await toolCalls.createTask({
				information,
				label,
				priority,
				deadlineDate,
			});
			await action();
			return {
				message: `Created task "${label}".`,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: deleteNoteTool,
		safety: SAFETY.destructive,
		normalizeArgs: (args) => ({
			id: asId(args.id),
		}),
		execute: async (args) => {
			const id = requireId(args.id);
			const undoAction = await captureDeleteNoteUndo(id);
			const action = await toolCalls.deleteNote({ id });
			await action();
			return {
				message: "Deleted the note.",
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
				undoAction,
			};
		},
	},
	{
		tool: deleteReminderTool,
		safety: SAFETY.destructive,
		normalizeArgs: (args) => ({
			id: asId(args.id),
		}),
		execute: async (args) => {
			const id = requireId(args.id);
			const undoAction = await captureDeleteReminderUndo(id);
			const action = await toolCalls.deleteReminder({ id });
			await action();
			return {
				message: "Deleted the reminder.",
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
				undoAction,
			};
		},
	},
	{
		tool: deleteSaveTool,
		safety: SAFETY.destructive,
		normalizeArgs: (args) => ({
			id: asId(args.id),
		}),
		execute: async (args) => {
			const id = requireId(args.id);
			const undoAction = await captureDeleteSaveUndo(id);
			const action = await toolCalls.deleteSave({ id });
			await action();
			return {
				message: "Deleted the save.",
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
				undoAction,
			};
		},
	},
	{
		tool: deleteTaskTool,
		safety: SAFETY.destructive,
		normalizeArgs: (args) => ({
			id: asId(args.id),
		}),
		execute: async (args) => {
			const id = requireId(args.id);
			const undoAction = await captureDeleteTaskUndo(id);
			const action = await toolCalls.deleteTask({ id });
			await action();
			return {
				message: "Deleted the task.",
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
				undoAction,
			};
		},
	},
	{
		tool: exportDataTool,
		safety: SAFETY.external,
		normalizeArgs: (args) => ({
			type:
				asEnum(args.type, [
					LEXPORT_TYPE.READABLE,
					LEXPORT_TYPE.IMPORTABLE,
				]) ?? LEXPORT_TYPE.READABLE,
		}),
		execute: async (args) => {
			const type =
				asEnum(args.type, [
					LEXPORT_TYPE.READABLE,
					LEXPORT_TYPE.IMPORTABLE,
				]) ?? LEXPORT_TYPE.READABLE;
			const password = asTrimmedString(args.password);
			const action = await toolCalls.exportData({ type, password });
			await action();
			return {
				message: "Export completed.",
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: formatDateTimeTool,
		safety: SAFETY.read,
		normalizeArgs: (args) => ({
			year: asInteger(args.year),
			month: asInteger(args.month),
			day: asInteger(args.day),
			hour: asInteger(args.hour),
			minute: asInteger(args.minute),
			second: asInteger(args.second),
		}),
		execute: async (args) => {
			const year = requireInteger(args.year, "year");
			const month = requireInteger(args.month, "month");
			const day = requireInteger(args.day, "day");
			const hour = requireInteger(args.hour, "hour");
			const minute = requireInteger(args.minute, "minute");
			const second = asInteger(args.second) ?? 0;
			const dateTime = toolCalls.formatDateTime({
				year,
				month,
				day,
				hour,
				minute,
				second,
			});
			return {
				message: `Formatted datetime: ${dateTime}`,
				modelPayload: {
					dateTime,
				},
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: getCurrentDateTimeInfoTool,
		safety: SAFETY.read,
		normalizeArgs: () => ({}),
		execute: async () => {
			const dateTimeInfo = toolCalls.getCurrentDataTimeInfo();
			return {
				message: dateTimeInfo,
				modelPayload: {
					dateTimeInfo,
				},
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: getRecentHistoryTool,
		safety: SAFETY.read,
		normalizeArgs: (args) => ({
			limit: asInteger(args.limit),
		}),
		execute: async (args) => {
			const limit = asInteger(args.limit) ?? 10;
			const history = await toolCalls.getRecentHistory(limit);
			if (history.length === 0) {
				return {
					message: "No recent history found.",
					modelPayload: {
						total: 0,
						results: [],
					},
					expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
				};
			}
			return {
				message: `Found ${history.length} recent history item${history.length === 1 ? "" : "s"}.`,
				modelPayload: {
					total: history.length,
					results: history.map(toModelSave),
				},
				content: {
					...createEmptyOutputContent(),
					saves: history,
				},
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: getProductivityOverviewTool,
		safety: SAFETY.read,
		normalizeArgs: () => ({}),
		execute: async () => {
			const overview = await toolCalls.getProductivityOverview();
			return {
				message: `Overview: ${overview.tasks.pending} pending tasks, ${overview.reminders.upcoming} upcoming reminders, ${overview.saves.total} saves, ${overview.notes.total} notes.`,
				modelPayload: overview,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: getSavePreviewImageTool,
		safety: SAFETY.read,
		normalizeArgs: (args) => ({
			id: asId(args.id),
			url: asTrimmedString(args.url),
			query: asTrimmedString(args.query),
		}),
		execute: async (args) => {
			const preview = await toolCalls.getSavePreviewImage({
				id: asId(args.id),
				url: asTrimmedString(args.url),
				query: asTrimmedString(args.query),
			});
			// The title comes from the website, so it must not be able to
			// add Markdown (links, images) of its own.
			const saveName = escapeMarkdownText(
				preview.save.customName || preview.save.title || "save",
			);
			const markdown = `Preview for **${saveName}**:\n\n![${saveName}](${preview.previewUrl})`;
			return {
				message: markdown,
				modelMessage: `Use this exact markdown to show the image:\n![${saveName}](${preview.previewUrl})`,
				modelPayload: {
					save: toModelSave(preview.save),
					hasImage: true,
					imageUrl: preview.previewUrl,
				},
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: getUserAppThemePrefTool,
		safety: SAFETY.read,
		normalizeArgs: () => ({}),
		execute: async () => {
			const theme = await toolCalls.getUserAppThemePref();
			return {
				message: `Your app theme is ${theme}.`,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: getUserNameTool,
		safety: SAFETY.read,
		normalizeArgs: () => ({}),
		execute: async () => {
			const userName = await toolCalls.getUserName();
			return {
				message: `Your name is ${userName}.`,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: searchNotesTool,
		safety: SAFETY.read,
		normalizeArgs: (args) => ({
			query:
				asTrimmedString(args.query) ??
				asTrimmedString(args.text) ??
				asTrimmedString(args.content) ??
				"",
		}),
		execute: async (args, context) => {
			const query = asString(args.query) ?? "";
			const notes = await toolCalls.searchNotes(context.ai, query);
			if (notes.length === 0) {
				return {
					message: "No notes found.",
					modelPayload: {
						total: 0,
						results: [],
					},
				};
			}
			return {
				message: `Found ${notes.length} note${notes.length === 1 ? "" : "s"}.`,
				modelPayload: {
					total: notes.length,
					results: notes.map(toModelNote),
				},
				content: {
					...createEmptyOutputContent(),
					notes,
				},
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: searchRemindersTool,
		safety: SAFETY.read,
		normalizeArgs: (args) => ({
			query:
				asTrimmedString(args.query) ??
				asTrimmedString(args.text) ??
				asTrimmedString(args.content),
			type: asEnum(args.type, [
				LREMINDER_TYPE.NORMAL,
				LREMINDER_TYPE.ESCALATING,
			]),
			targetDate: asDateString(args.targetDate),
			targetDateCriteria: asDateCriteria(args.targetDateCriteria),
		}),
		execute: async (args, context) => {
			const reminders = await toolCalls.searchReminders(context.ai, {
				query: asString(args.query),
				type: asEnum(args.type, [
					LREMINDER_TYPE.NORMAL,
					LREMINDER_TYPE.ESCALATING,
				]),
				targetDate: asDateString(args.targetDate),
				targetDateCriteria: asDateCriteria(args.targetDateCriteria),
			});
			if (reminders.length === 0) {
				return {
					message: "No reminders found.",
					modelPayload: {
						total: 0,
						results: [],
					},
				};
			}
			return {
				message: `Found ${reminders.length} reminder${reminders.length === 1 ? "" : "s"}.`,
				modelPayload: {
					total: reminders.length,
					results: reminders.map(toModelReminder),
				},
				content: {
					...createEmptyOutputContent(),
					reminders,
				},
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: searchSavesTool,
		safety: SAFETY.read,
		normalizeArgs: (args) => ({
			query:
				asTrimmedString(args.query) ??
				asTrimmedString(args.text) ??
				asTrimmedString(args.content),
			domain: asTrimmedString(args.domain),
			url: asTrimmedString(args.url),
		}),
		execute: async (args, context) => {
			const saves = await toolCalls.searchSaves(context.ai, {
				query: asString(args.query),
				domain: asString(args.domain),
				url: asString(args.url),
			});
			if (saves.length === 0) {
				return {
					message: "No saves found.",
					modelPayload: {
						total: 0,
						results: [],
					},
				};
			}
			return {
				message: `Found ${saves.length} save${saves.length === 1 ? "" : "s"}.`,
				modelPayload: {
					total: saves.length,
					results: saves.map(toModelSave),
				},
				content: {
					...createEmptyOutputContent(),
					saves,
				},
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: searchTasksTool,
		safety: SAFETY.read,
		normalizeArgs: (args) => ({
			query:
				asTrimmedString(args.query) ??
				asTrimmedString(args.text) ??
				asTrimmedString(args.content),
			priority: asEnum(args.priority, [
				LTASK_PRIORITY.LOW,
				LTASK_PRIORITY.MEDIUM,
				LTASK_PRIORITY.HIGH,
			]),
			scheduleType: asScheduleKind(args.scheduleType),
			deadlineDate: asDateString(args.deadlineDate),
			deadlineDateCriteria: asDateCriteria(args.deadlineDateCriteria),
			finishDate: asDateString(args.finishDate),
			finishDateCriteria: asDateCriteria(args.finishDateCriteria),
		}),
		execute: async (args, context) => {
			const tasks = await toolCalls.searchTasks(context.ai, {
				query: asString(args.query),
				priority: asEnum(args.priority, [
					LTASK_PRIORITY.LOW,
					LTASK_PRIORITY.MEDIUM,
					LTASK_PRIORITY.HIGH,
				]),
				scheduleType: asScheduleKind(args.scheduleType),
				deadlineDate: asDateString(args.deadlineDate),
				deadlineDateCriteria: asDateCriteria(args.deadlineDateCriteria),
				finishDate: asDateString(args.finishDate),
				finishDateCriteria: asDateCriteria(args.finishDateCriteria),
			});
			if (tasks.length === 0) {
				return {
					message: "No tasks found.",
					modelPayload: {
						total: 0,
						results: [],
					},
				};
			}
			return {
				message: `Found ${tasks.length} task${tasks.length === 1 ? "" : "s"}.`,
				modelPayload: {
					total: tasks.length,
					results: tasks.map(toModelTask),
				},
				content: {
					...createEmptyOutputContent(),
					tasks,
				},
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: setUserAppThemePrefTool,
		safety: SAFETY.mutate,
		normalizeArgs: (args) => ({
			theme: asEnum(args.theme, [LTHEME.LIGHT, LTHEME.DARK]),
		}),
		execute: async (args) => {
			const theme = asEnum(args.theme, [LTHEME.LIGHT, LTHEME.DARK]);
			if (!theme) {
				throw new Error("theme is required.");
			}
			const action = await toolCalls.setUserAppThemePref({ theme });
			await action();
			return {
				message: `Theme updated to ${theme}.`,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: updateNoteTool,
		safety: SAFETY.mutate,
		normalizeArgs: (args) => ({
			id: asId(args.id),
			content:
				asTrimmedString(args.content) ??
				asTrimmedString(args.message) ??
				asTrimmedString(args.text),
		}),
		execute: async (args) => {
			const id = requireId(args.id);
			const content = requireString(args.content, "content");
			const action = await toolCalls.updateNote(id, content);
			await action();
			const noteLabel = deriveNoteLabel(content);
			return {
				message: `Updated note "${noteLabel}".`,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: updateReminderTool,
		safety: SAFETY.mutate,
		normalizeArgs: (args) => {
			const targetDateInput =
				asTrimmedString(args.targetDate) ??
				asTrimmedString(args.targetTS);
			const targetDate = asDateString(targetDateInput);
			return {
				id: asId(args.id),
				message: (() => {
					const rawMessage = clampText(
						asTrimmedString(args.message) ??
							asTrimmedString(args.content) ??
							asTrimmedString(args.text),
						LMAX_REMINDER_MESSAGE_LENGTH,
					);
					return rawMessage
						? sanitizeReminderMessage(rawMessage, targetDate)
						: rawMessage;
				})(),
				type: asEnum(args.type, [
					LREMINDER_TYPE.NORMAL,
					LREMINDER_TYPE.ESCALATING,
				]),
				targetDate,
				targetDateInvalid:
					targetDateInput !== undefined && targetDate === undefined,
			};
		},
		execute: async (args) => {
			const id = requireId(args.id);
			const existingReminder = (
				await readReminders(await unlockedKeys())
			).find((reminder) => reminder.id === id);
			if (!existingReminder) {
				throw new Error("Reminder not found.");
			}
			if (args.targetDateInvalid === true) {
				throw new Error(
					"targetDate must be in YYYY-MM-DDTHH:mm:ssZ format.",
				);
			}
			const nextTargetDate =
				asDateString(args.targetDate) ??
				toModelDate(existingReminder.target);
			const nextMessage = sanitizeReminderMessage(
				asString(args.message) ?? existingReminder.message,
				nextTargetDate,
			);
			const action = await toolCalls.updateReminder(id, {
				message: nextMessage,
				type: asEnum(args.type, [
					LREMINDER_TYPE.NORMAL,
					LREMINDER_TYPE.ESCALATING,
				]),
				targetDate: nextTargetDate,
			});
			await action();
			return {
				message: `Updated reminder "${nextMessage}" for ${nextTargetDate}.`,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: updateTaskTool,
		safety: SAFETY.mutate,
		normalizeArgs: (args) => {
			const deadlineDateInput = asTrimmedString(args.deadlineDate);
			const deadlineDate = asDateString(deadlineDateInput);
			return {
				id: asId(args.id),
				information: clampText(
					asTrimmedString(args.information),
					LMAX_TASK_INFORMATION_LENGTH,
				),
				label: clampText(
					asTrimmedString(args.label),
					LMAX_TASK_LABEL_LENGTH,
				),
				priority: asEnum(args.priority, [
					LTASK_PRIORITY.LOW,
					LTASK_PRIORITY.MEDIUM,
					LTASK_PRIORITY.HIGH,
				]),
				deadlineDate,
				deadlineDateInvalid:
					deadlineDateInput !== undefined &&
					deadlineDate === undefined,
			};
		},
		execute: async (args) => {
			if (args.deadlineDateInvalid === true) {
				throw new Error(
					"deadlineDate must be in YYYY-MM-DDTHH:mm:ssZ format.",
				);
			}
			const id = requireId(args.id);
			const action = await toolCalls.updateTask({
				id,
				information: asTrimmedString(args.information),
				label: asTrimmedString(args.label),
				priority: asEnum(args.priority, [
					LTASK_PRIORITY.LOW,
					LTASK_PRIORITY.MEDIUM,
					LTASK_PRIORITY.HIGH,
				]),
				deadlineDate: asDateString(args.deadlineDate),
			});
			await action();
			return {
				message: `Updated task ${id}.`,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: saveActiveWebPageTool,
		safety: SAFETY.mutate,
		normalizeArgs: () => ({}),
		execute: async () => {
			const action = await toolCalls.saveActiveWebPage();
			await action();
			return {
				message: "Saved the current page.",
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: updateSaveTool,
		safety: SAFETY.mutate,
		normalizeArgs: (args) => ({
			id: asId(args.id),
			customName: clampText(
				asTrimmedString(args.customName) ??
					asTrimmedString(args.name) ??
					asTrimmedString(args.title),
				LMAX_TASK_INFORMATION_LENGTH,
			),
		}),
		execute: async (args) => {
			const id = requireId(args.id);
			const customName = requireString(args.customName, "customName");
			const action = await toolCalls.updateSave({ id, customName });
			await action();
			return {
				message: `Updated save "${customName}".`,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
];

const toolRegistry = new Map<string, ToolDefinition>(
	toolDefinitions.map((definition) => [
		definition.tool.function.name,
		{
			...definition,
			safety: definition.safety ?? SAFETY.read,
		},
	]),
);

const toolRequiresConfirmation = (toolName: string): boolean => {
	const definition = toolRegistry.get(toolName);
	return Boolean(definition && definition.safety?.kind !== "read");
};

export {
	createEmptyOutputContent,
	toolRegistry,
	toolRequiresConfirmation,
	tools,
};

export type {
	AIOutputContent,
	ToolDefinition,
	ToolExecutionContext,
	ToolExecutionResult,
	ToolUndoAction,
};
