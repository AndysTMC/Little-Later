import type { AIOwner } from "./owner";
import type OpenAI from "openai";
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
import { parseRule, type RecurrenceRule } from "little-shared/utils/schedule";
import type {
	ImageRecord,
	Note,
	Reminder,
	Save,
	Task,
} from "../../storage/repositories";
import type { LinkRow, TaskSchedule } from "../../storage/schema";
import { linkedTo, reminderKind } from "../../popup/records";
import { prettyRule } from "../../utils/dates";
import { normalizeTags } from "../../utils/tags";
import {
	readLinks,
	readNotes,
	readReminders,
	readSaves,
	readTasks,
} from "./records";
import toolCalls from "./toolCalls";
import {
	isValidLDateString,
	LDateMatchCriteria,
	normalizeDateMatchCriteria,
	toModelDate,
} from "./toolCalls/_utils/dateFilters";
import tools, {
	askUserTool,
	createNoteTool,
	createReminderTool,
	createTaskTool,
	deleteNoteTool,
	deleteReminderTool,
	deleteSaveTool,
	deleteTaskTool,
	exportDataTool,
	forgetFactTool,
	formatDateTimeTool,
	getCurrentDateTimeInfoTool,
	getProductivityOverviewTool,
	getRecentHistoryTool,
	getSavePreviewImageTool,
	getUserAppThemePrefTool,
	getUserNameTool,
	linkRecordsTool,
	readOpenTabsTool,
	rememberFactTool,
	saveActiveWebPageTool,
	searchAllTool,
	searchImagesTool,
	searchNotesTool,
	searchRemindersTool,
	searchSavesTool,
	searchTasksTool,
	setUserAppThemePrefTool,
	unlinkRecordsTool,
	updateNoteTool,
	updateReminderTool,
	updateSaveTool,
	updateTaskTool,
} from "./tools";

type StructuredResponseProvider = {
	getStructuredResponse(
		prompt: string,
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
	// The profile the request belongs to; every read and write goes
	// through it (owner.ts).
	owner: AIOwner;
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
	tool: OpenAI.Chat.Completions.ChatCompletionFunctionTool;
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

// ask_user's arguments, kept to what the box can show: one question and
// 2 to 5 distinct, short options.
const normalizeQuestion = (args: Record<string, unknown>) => {
	const options = Array.isArray(args.options)
		? [
				...new Set(
					args.options
						.filter(
							(option): option is string =>
								typeof option === "string",
						)
						.map((option) => option.trim().slice(0, 120))
						.filter((option) => option !== ""),
				),
			].slice(0, 5)
		: [];
	return {
		question:
			(typeof args.question === "string"
				? args.question.trim()
				: ""
			).slice(0, 300) || "Which one?",
		options,
		allowOther: args.allowOther !== false,
	};
};

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
	owner: AIOwner,
	fromId: string,
	targetIds: ReadonlyArray<string>,
): Promise<void> => {
	for (const toId of targetIds) {
		await owner.send("link.create", { fromId, toId });
	}
};

const snapshot = async (owner: AIOwner) => {
	const keys = await owner.keys();
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
	owner: AIOwner,
	id: string,
): Promise<ToolUndoAction | undefined> => {
	const { links, notes } = await snapshot(owner);
	const note = notes.find((item) => item.id === id);
	if (!note) {
		return undefined;
	}
	// A note links only to saves; they come back with it in one command.
	const saveIds = targetsOf(links, id);
	return {
		label: "Delete note",
		run: async () => {
			await owner.send("note.create", {
				content: note.content,
				...(note.title ? { title: note.title } : {}),
				...(note.tags && note.tags.length > 0
					? { tags: note.tags }
					: {}),
				saveIds,
			});
		},
	};
};

const captureDeleteReminderUndo = async (
	owner: AIOwner,
	id: string,
): Promise<ToolUndoAction | undefined> => {
	const { links, reminders, saves } = await snapshot(owner);
	const reminder = reminders.find((item) => item.id === id);
	if (!reminder || reminder.target <= Date.now()) {
		return undefined;
	}
	const isSave = new Set(saves.map((save) => save.id));
	const targetIds = targetsOf(links, id);
	const saveIds = targetIds.filter((toId) => isSave.has(toId));
	const otherIds = targetIds.filter((toId) => !isSave.has(toId));
	return {
		label: "Delete reminder",
		run: async () => {
			const created = await owner.send("reminder.create", {
				message: reminder.message,
				target: reminder.target,
				escalate: reminder.escalation !== null,
				...(reminder.tags && reminder.tags.length > 0
					? { tags: reminder.tags }
					: {}),
				saveIds,
			});
			await relink(owner, created.id, otherIds);
		},
	};
};

// Deleting a save unsaves it, which detaches its notes, tasks and
// reminders; undo saves it again and reattaches them. If the page is no
// longer in history (`!save.browsed`), unsaving deletes it permanently so
// undo is not offered.
const captureDeleteSaveUndo = async (
	owner: AIOwner,
	id: string,
): Promise<ToolUndoAction | undefined> => {
	const { links, saves } = await snapshot(owner);
	const save = saves.find((item) => item.id === id && item.saved);
	if (!save || !save.browsed) {
		return undefined;
	}
	const sourceIds = links
		.filter((link) => link.toId === id)
		.map((link) => link.fromId);
	return {
		label: "Delete save",
		run: async () => {
			await owner.send("save.update", { id, saved: true });
			for (const fromId of sourceIds) {
				await owner.send("link.create", { fromId, toId: id });
			}
		},
	};
};

// A task's own reminder is deleted with it and comes back with it.
const captureDeleteTaskUndo = async (
	owner: AIOwner,
	id: string,
): Promise<ToolUndoAction | undefined> => {
	const { links, reminders, tasks } = await snapshot(owner);
	const task = tasks.find((item) => item.id === id);
	if (!task) {
		return undefined;
	}
	const [reminder] = linkedTo(links, id, reminders);
	const saveIds = targetsOf(links, id);
	return {
		label: "Delete task",
		run: async () => {
			const created = await owner.send("task.create", {
				information: task.information,
				label: task.label,
				priority: task.priority,
				schedule: task.schedule,
				reminder:
					reminder && task.schedule.kind !== "anytime"
						? reminderKind(reminder)
						: null,
				...(task.tags && task.tags.length > 0
					? { tags: task.tags }
					: {}),
				saveIds,
			});
			if (task.done) {
				await owner.send("task.complete", { id: created.id });
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
	if (maxLength <= 3) {
		return normalized.slice(0, maxLength);
	}
	return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
};

const deriveNoteLabel = (content: string): string => {
	const firstNonEmptyLine =
		content
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line !== "") ?? "Untitled note";
	return summarizeInlineText(firstNonEmptyLine, 64);
};

// Models often repeat the schedule inside the reminder's text ("Submit
// report on April 7 2026 at 9:30 AM") although the time has its own
// field. A trailing phrase is dropped only when it is clearly a date: a
// month followed by a day number, a numeric date, or a whole day word.
// Matching any word that merely starts like a month cut real text
// ("slides for Mayfield" lost everything after "for"). The confirmation
// shows the text after this step, so what is approved is what is stored.
const temporalSuffixPattern =
	/\s+(?:for|on)\s+(?:(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\.?\s+\d{1,2}\b|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\d{4}-\d{2}-\d{2}\b|(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b).*/i;

const sanitizeReminderMessage = (value: string, targetDate?: LDate): string => {
	const normalized = value.replace(/\s+/g, " ").trim();
	if (normalized === "" || !targetDate) {
		return normalized;
	}
	const stripped = normalized.replace(temporalSuffixPattern, "").trim();
	return stripped.length >= 3 ? stripped : normalized;
};

// What one search hands the model. The chat still receives every record
// through `content`; the model gets a bounded page, so one question never
// sends a whole notebook to the provider or overflows its context.
const MODEL_RESULT_LIMIT = 25;
const MODEL_TEXT_LIMIT = 2_000;
const forModel = <T, M>(records: Array<T>, toModel: (record: T) => M) => ({
	total: records.length,
	results: records.slice(0, MODEL_RESULT_LIMIT).map(toModel),
	...(records.length > MODEL_RESULT_LIMIT
		? {
				note: `Only the first ${MODEL_RESULT_LIMIT} are listed. Search with a narrower query to see others.`,
			}
		: {}),
});

const asTags = (value: unknown): Array<string> | undefined => {
	if (!Array.isArray(value)) return undefined;
	const strings = value.filter(
		(entry): entry is string => typeof entry === "string",
	);
	return normalizeTags(strings);
};

const asRecurrenceRule = (value: unknown): RecurrenceRule | undefined => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw.freq !== "string") return undefined;
	const now = new Date();
	const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	try {
		return parseRule({
			freq: raw.freq,
			interval: asInteger(raw.interval) ?? 1,
			time: typeof raw.time === "string" ? raw.time : "09:00",
			...(Array.isArray(raw.byWeekday)
				? {
						byWeekday: raw.byWeekday
							.map((entry) => asInteger(entry))
							.filter(
								(entry): entry is number => entry !== undefined,
							),
					}
				: {}),
			...(asInteger(raw.byMonthDay) !== undefined
				? { byMonthDay: asInteger(raw.byMonthDay) }
				: {}),
			...(asInteger(raw.byMonth) !== undefined
				? { byMonth: asInteger(raw.byMonth) }
				: {}),
			anchor: typeof raw.anchor === "string" ? raw.anchor : today,
			zone: typeof raw.zone === "string" ? raw.zone : "floating",
		});
	} catch {
		return undefined;
	}
};

const toModelImage = (image: ImageRecord) => ({
	id: image.id,
	title: image.title,
	mimeType: image.mimeType,
	...(image.sourceUrl ? { sourceUrl: image.sourceUrl } : {}),
	...(image.tags && image.tags.length > 0 ? { tags: image.tags } : {}),
	updatedAt: toModelDate(image.updatedAt),
});

const toModelNote = (note: Note) => ({
	id: note.id,
	...(note.title ? { title: note.title } : {}),
	content: note.content.slice(0, MODEL_TEXT_LIMIT),
	...(note.content.length > MODEL_TEXT_LIMIT ? { truncated: true } : {}),
	...(note.tags && note.tags.length > 0 ? { tags: note.tags } : {}),
	lastModificationDate: toModelDate(note.updatedAt),
});

const toModelSave = (save: Save) => ({
	id: save.id,
	name: save.customName,
	title: save.title,
	url: save.url,
	...(save.tags && save.tags.length > 0 ? { tags: save.tags } : {}),
	...(save.archived ? { archived: true } : {}),
	lastBrowseDate: toModelDate(save.browsedAt),
	isSaved: save.saved,
});

const toModelReminder = (reminder: Reminder) => ({
	id: reminder.id,
	message: reminder.message,
	targetDate: toModelDate(reminder.target),
	type: reminderKind(reminder),
	...(reminder.tags && reminder.tags.length > 0
		? { tags: reminder.tags }
		: {}),
	lastNotificationDate:
		reminder.lastFiredAt === 0 ? null : toModelDate(reminder.lastFiredAt),
	// False once it has fired for the last time.
	pending: reminder.nextFireAt !== 0,
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
	...(task.tags && task.tags.length > 0 ? { tags: task.tags } : {}),
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
		execute: async (args, { owner }) => {
			const content = requireString(args.content, "content");
			const action = await toolCalls.createNote(owner, { content });
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
		execute: async (args, { owner }) => {
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
			const action = await toolCalls.createReminder(owner, {
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
			const recurrenceInput = args.recurrence;
			const recurrence = asRecurrenceRule(recurrenceInput);
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
				recurrence,
				recurrenceInvalid:
					recurrenceInput !== undefined && recurrence === undefined,
				tags: asTags(args.tags),
			};
		},
		execute: async (args, { owner }) => {
			if (args.deadlineDateInvalid === true) {
				throw new Error(
					"deadlineDate must be in YYYY-MM-DDTHH:mm:ssZ format.",
				);
			}
			if (args.recurrenceInvalid === true) {
				throw new Error(
					"recurrence must specify a valid freq (daily, weekly, monthly, yearly) and optional HH:mm time.",
				);
			}
			const information = requireString(args.information, "information");
			const label = asTrimmedString(args.label) ?? "";
			// Unset, the task gets the same default as one made in the popup.
			const priority = asEnum(args.priority, [
				LTASK_PRIORITY.LOW,
				LTASK_PRIORITY.MEDIUM,
				LTASK_PRIORITY.HIGH,
			]);
			const deadlineDate = asDateString(args.deadlineDate);
			const recurrence = asRecurrenceRule(args.recurrence);
			const tags = asTags(args.tags);
			const action = await toolCalls.createTask(owner, {
				information,
				label,
				priority,
				deadlineDate,
				recurrence,
				tags,
			});
			await action();
			const summary = label || summarizeInlineText(information, 40);
			return {
				message: `Created task "${summary}".`,
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
		execute: async (args, { owner }) => {
			const id = requireId(args.id);
			const exists = (await readNotes(await owner.keys())).some(
				(note) => note.id === id,
			);
			if (!exists) {
				throw new Error("Note not found.");
			}
			const undoAction = await captureDeleteNoteUndo(owner, id);
			const action = await toolCalls.deleteNote(owner, { id });
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
		execute: async (args, { owner }) => {
			const id = requireId(args.id);
			const exists = (await readReminders(await owner.keys())).some(
				(reminder) => reminder.id === id,
			);
			if (!exists) {
				throw new Error("Reminder not found.");
			}
			const undoAction = await captureDeleteReminderUndo(owner, id);
			const action = await toolCalls.deleteReminder(owner, { id });
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
		execute: async (args, { owner }) => {
			const id = requireId(args.id);
			const undoAction = await captureDeleteSaveUndo(owner, id);
			const action = await toolCalls.deleteSave(owner, { id });
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
		execute: async (args, { owner }) => {
			const id = requireId(args.id);
			const exists = (await readTasks(await owner.keys())).some(
				(task) => task.id === id,
			);
			if (!exists) {
				throw new Error("Task not found.");
			}
			const undoAction = await captureDeleteTaskUndo(owner, id);
			const action = await toolCalls.deleteTask(owner, { id });
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
		execute: async (args, { owner }) => {
			const type =
				asEnum(args.type, [
					LEXPORT_TYPE.READABLE,
					LEXPORT_TYPE.IMPORTABLE,
				]) ?? LEXPORT_TYPE.READABLE;
			// Passed as typed: the backup refuses outer spaces itself, as it
			// does on the Export page, rather than protecting the file with
			// a password other than the one the user chose.
			const password =
				typeof args.password === "string" ? args.password : undefined;
			const action = await toolCalls.exportData(owner, {
				type,
				password,
			});
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
		execute: async (args, { owner }) => {
			const limit = asInteger(args.limit) ?? 10;
			const history = await toolCalls.getRecentHistory(owner, limit);
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
				modelPayload: forModel(history, toModelSave),
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
		execute: async (_args, { owner }) => {
			const overview = await toolCalls.getProductivityOverview(owner);
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
		execute: async (args, { owner }) => {
			const preview = await toolCalls.getSavePreviewImage(owner, {
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
				modelMessage: `The preview image for **${saveName}** will be shown to the user automatically. Reply briefly without repeating an image URL.`,
				modelPayload: {
					save: toModelSave(preview.save),
					hasImage: true,
				},
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: getUserAppThemePrefTool,
		safety: SAFETY.read,
		normalizeArgs: () => ({}),
		execute: async (_args, { owner }) => {
			const theme = await toolCalls.getUserAppThemePref(owner);
			return {
				message: `Your app theme is ${theme}.`,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	// Ends the turn with a question (main.ts handles it before any tool
	// runs); this only answers a provider that calls it some other way.
	{
		tool: askUserTool,
		safety: SAFETY.read,
		normalizeArgs: (args) => normalizeQuestion(args),
		execute: async () => ({
			message: "Waiting for the user's answer.",
			expression: LFACE_EXPRESSION.THINKING,
		}),
	},
	{
		tool: getUserNameTool,
		safety: SAFETY.read,
		normalizeArgs: () => ({}),
		execute: async (_args, { owner }) => {
			const userName = await toolCalls.getUserName(owner);
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
			tag: asTrimmedString(args.tag),
		}),
		execute: async (args, { ai, owner }) => {
			const query = asString(args.query) ?? "";
			const notes = await toolCalls.searchNotes(
				owner,
				ai,
				query,
				asTrimmedString(args.tag),
			);
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
				modelPayload: forModel(notes, toModelNote),
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
		normalizeArgs: (args) => {
			const targetDateInput = asTrimmedString(args.targetDate);
			const targetDate = asDateString(targetDateInput);
			return {
				query:
					asTrimmedString(args.query) ??
					asTrimmedString(args.text) ??
					asTrimmedString(args.content),
				type: asEnum(args.type, [
					LREMINDER_TYPE.NORMAL,
					LREMINDER_TYPE.ESCALATING,
				]),
				targetDate,
				targetDateInvalid:
					targetDateInput !== undefined && targetDate === undefined,
				targetDateCriteria: asDateCriteria(args.targetDateCriteria),
				tag: asTrimmedString(args.tag),
			};
		},
		execute: async (args, { ai, owner }) => {
			if (args.targetDateInvalid === true) {
				throw new Error(
					"targetDate must be in YYYY-MM-DDTHH:mm:ssZ format.",
				);
			}
			const reminders = await toolCalls.searchReminders(owner, ai, {
				query: asString(args.query),
				type: asEnum(args.type, [
					LREMINDER_TYPE.NORMAL,
					LREMINDER_TYPE.ESCALATING,
				]),
				targetDate: asDateString(args.targetDate),
				targetDateCriteria: asDateCriteria(args.targetDateCriteria),
				tag: asTrimmedString(args.tag),
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
				modelPayload: forModel(reminders, toModelReminder),
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
			tag: asTrimmedString(args.tag),
		}),
		execute: async (args, { ai, owner }) => {
			const saves = await toolCalls.searchSaves(owner, ai, {
				query: asString(args.query),
				domain: asString(args.domain),
				url: asString(args.url),
				tag: asTrimmedString(args.tag),
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
				modelPayload: forModel(saves, toModelSave),
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
		normalizeArgs: (args) => {
			const deadlineDateInput = asTrimmedString(args.deadlineDate);
			const deadlineDate = asDateString(deadlineDateInput);
			const finishDateInput = asTrimmedString(args.finishDate);
			const finishDate = asDateString(finishDateInput);
			return {
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
				deadlineDate,
				deadlineDateInvalid:
					deadlineDateInput !== undefined &&
					deadlineDate === undefined,
				deadlineDateCriteria: asDateCriteria(args.deadlineDateCriteria),
				finishDate,
				finishDateInvalid:
					finishDateInput !== undefined && finishDate === undefined,
				finishDateCriteria: asDateCriteria(args.finishDateCriteria),
				tag: asTrimmedString(args.tag),
			};
		},
		execute: async (args, { ai, owner }) => {
			if (args.deadlineDateInvalid === true) {
				throw new Error(
					"deadlineDate must be in YYYY-MM-DDTHH:mm:ssZ format.",
				);
			}
			if (args.finishDateInvalid === true) {
				throw new Error(
					"finishDate must be in YYYY-MM-DDTHH:mm:ssZ format.",
				);
			}
			const tasks = await toolCalls.searchTasks(owner, ai, {
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
				tag: asTrimmedString(args.tag),
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
				modelPayload: forModel(tasks, toModelTask),
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
		execute: async (args, { owner }) => {
			const theme = asEnum(args.theme, [LTHEME.LIGHT, LTHEME.DARK]);
			if (!theme) {
				throw new Error("theme is required.");
			}
			const action = await toolCalls.setUserAppThemePref(owner, {
				theme,
			});
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
		execute: async (args, { owner }) => {
			const id = requireId(args.id);
			const content = requireString(args.content, "content");
			const action = await toolCalls.updateNote(owner, id, content);
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
		execute: async (args, { owner }) => {
			const id = requireId(args.id);
			const existingReminder = (
				await readReminders(await owner.keys())
			).find((reminder) => reminder.id === id);
			if (!existingReminder) {
				throw new Error("Reminder not found.");
			}
			if (args.targetDateInvalid === true) {
				throw new Error(
					"targetDate must be in YYYY-MM-DDTHH:mm:ssZ format.",
				);
			}
			// Only a date the model sent is a change. Sending the stored
			// time back through its text form drops the milliseconds, which
			// the worker would read as a new time and restart the schedule.
			const requestedTargetDate = asDateString(args.targetDate);
			const nextTargetDate =
				requestedTargetDate ?? toModelDate(existingReminder.target);
			const requestedMessage = asString(args.message);
			// Keep the message exactly as normalized and approved at
			// confirmation time rather than mutating it post-approval.
			const nextMessage = requestedMessage ?? existingReminder.message;
			const action = await toolCalls.updateReminder(owner, id, {
				message:
					requestedMessage === undefined ? undefined : nextMessage,
				type: asEnum(args.type, [
					LREMINDER_TYPE.NORMAL,
					LREMINDER_TYPE.ESCALATING,
				]),
				targetDate: requestedTargetDate,
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
				tags: asTags(args.tags),
			};
		},
		execute: async (args, { owner }) => {
			if (args.deadlineDateInvalid === true) {
				throw new Error(
					"deadlineDate must be in YYYY-MM-DDTHH:mm:ssZ format.",
				);
			}
			const id = requireId(args.id);
			const action = await toolCalls.updateTask(owner, {
				id,
				information: asTrimmedString(args.information),
				label: asTrimmedString(args.label),
				priority: asEnum(args.priority, [
					LTASK_PRIORITY.LOW,
					LTASK_PRIORITY.MEDIUM,
					LTASK_PRIORITY.HIGH,
				]),
				deadlineDate: asDateString(args.deadlineDate),
				tags: asTags(args.tags),
			});
			await action();
			return {
				message: "Updated the task.",
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: searchAllTool,
		safety: SAFETY.read,
		normalizeArgs: (args) => ({
			query: asTrimmedString(args.query) ?? "",
			tag: asTrimmedString(args.tag),
			limit: asInteger(args.limit),
		}),
		execute: async (args, { owner }) => {
			const result = await toolCalls.searchAll(owner, {
				query: asString(args.query) ?? "",
				tag: asTrimmedString(args.tag),
				limit: asInteger(args.limit),
			});
			const total =
				result.notes.length +
				result.tasks.length +
				result.reminders.length +
				result.saves.length +
				result.images.length;
			return {
				message:
					total === 0
						? "No matching records found."
						: `Found ${total} matching record${total === 1 ? "" : "s"} across your vault.`,
				modelPayload: {
					total,
					notes: result.notes.map(toModelNote),
					tasks: result.tasks.map(toModelTask),
					reminders: result.reminders.map(toModelReminder),
					saves: result.saves.map(toModelSave),
					images: result.images.map(toModelImage),
				},
				content: {
					notes: result.notes,
					tasks: result.tasks,
					reminders: result.reminders,
					saves: result.saves,
				},
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: searchImagesTool,
		safety: SAFETY.read,
		normalizeArgs: (args) => ({
			query: asTrimmedString(args.query) ?? "",
			tag: asTrimmedString(args.tag),
		}),
		execute: async (args, { owner }) => {
			const images = await toolCalls.searchImages(owner, {
				query: asString(args.query) ?? "",
				tag: asTrimmedString(args.tag),
			});
			return {
				message:
					images.length === 0
						? "No images found."
						: `Found ${images.length} image${images.length === 1 ? "" : "s"}.`,
				modelPayload: forModel(images, toModelImage),
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: readOpenTabsTool,
		safety: SAFETY.read,
		normalizeArgs: (args) => ({
			limit: asInteger(args.limit),
		}),
		execute: async (args) => {
			const tabs = await toolCalls.readOpenTabs(asInteger(args.limit));
			return {
				message:
					tabs.length === 0
						? "No open web tabs found."
						: `Found ${tabs.length} open tab${tabs.length === 1 ? "" : "s"}.`,
				modelPayload: { total: tabs.length, tabs },
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: linkRecordsTool,
		safety: SAFETY.mutate,
		normalizeArgs: (args) => ({
			fromId: asId(args.fromId),
			toId: asId(args.toId),
		}),
		execute: async (args, { owner }) => {
			const fromId = requireString(args.fromId, "fromId");
			const toId = requireString(args.toId, "toId");
			const action = await toolCalls.linkRecords(owner, { fromId, toId });
			await action();
			return {
				message: "Linked records.",
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: unlinkRecordsTool,
		safety: SAFETY.destructive,
		normalizeArgs: (args) => ({
			fromId: asId(args.fromId),
			toId: asId(args.toId),
		}),
		execute: async (args, { owner }) => {
			const fromId = requireString(args.fromId, "fromId");
			const toId = requireString(args.toId, "toId");
			const action = await toolCalls.unlinkRecords(owner, {
				fromId,
				toId,
			});
			await action();
			return {
				message: "Unlinked records.",
				undoAction: {
					label: "Unlink records",
					run: async () => {
						await owner.send("link.create", { fromId, toId });
					},
				},
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: rememberFactTool,
		safety: SAFETY.mutate,
		normalizeArgs: (args) => ({
			text: clampText(asTrimmedString(args.text), 240),
		}),
		execute: async (args, { owner }) => {
			const text = requireString(args.text, "text");
			const action = await toolCalls.rememberFact(owner, { text });
			await action();
			return {
				message: `Remembered: "${text}".`,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: forgetFactTool,
		safety: SAFETY.destructive,
		normalizeArgs: (args) => ({
			id: asId(args.id),
			query: asTrimmedString(args.query),
		}),
		execute: async (args, { owner }) => {
			const action = await toolCalls.forgetFact(owner, {
				id: asId(args.id),
				query: asTrimmedString(args.query),
			});
			await action();
			return {
				message: "Forgot that memory.",
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: saveActiveWebPageTool,
		safety: SAFETY.mutate,
		normalizeArgs: (args) => ({
			url: asTrimmedString(args.url),
			title: asTrimmedString(args.title),
		}),
		execute: async (args, { owner }) => {
			const action = await toolCalls.saveActiveWebPage(owner, {
				url: asTrimmedString(args.url),
				title: asTrimmedString(args.title),
			});
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
				1_000,
			),
		}),
		execute: async (args, { owner }) => {
			const id = requireId(args.id);
			const customName = requireString(args.customName, "customName");
			const action = await toolCalls.updateSave(owner, {
				id,
				customName,
			});
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
			// Fail closed: any tool omitting safety requires confirmation.
			safety: definition.safety ?? SAFETY.mutate,
			// Models occasionally emit null, primitives, or arrays as arguments.
			normalizeArgs: (args) =>
				definition.normalizeArgs(
					args && typeof args === "object" && !Array.isArray(args)
						? args
						: {},
				),
		},
	]),
);

const toolRequiresConfirmation = (toolName: string): boolean => {
	const definition = toolRegistry.get(toolName);
	return Boolean(definition && definition.safety?.kind !== "read");
};

export {
	normalizeQuestion,
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
