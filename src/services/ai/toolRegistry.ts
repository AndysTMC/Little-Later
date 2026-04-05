import OpenAI from "openai";
import {
	LEXPORT_TYPE,
	LFACE_EXPRESSION,
	LLINK_TYPE,
	LRECURRING_TYPE,
	LREMINDER_TYPE,
	LTASK_PRIORITY,
	LTASK_SCHEDULE_TYPE,
	LTHEME,
} from "little-shared/enums";
import {
	LAIOutputContent,
	LDate,
	LLink,
	LRecurringInfo,
	LReminder,
} from "little-shared/types";
import { db } from "../../utils/db";
import { ResponseFormatJSONSchema } from "openai/resources.mjs";
import toolCalls from "./toolCalls";
import {
	isValidLDateString,
	isValidLTimeString,
	LDateMatchCriteria,
	normalizeDateMatchCriteria,
} from "./toolCalls/_utils/dateFilters";
import tools, {
	createNoteTool,
	createReminderTool,
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
	searchNotesTool,
	searchRemindersTool,
	searchSavesTool,
	searchTasksTool,
	setUserAppThemePrefTool,
	updateNoteTool,
	updateReminderTool,
} from "./tools";

type StructuredResponseProvider = {
	getStructuredResponse(
		prompt: string,
		jsonSchema?: ResponseFormatJSONSchema.JSONSchema,
		jsonObjectSchema?: string,
	): Promise<unknown>;
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
	content?: LAIOutputContent;
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

const createEmptyOutputContent = (): LAIOutputContent => ({
	saves: [],
	reminders: [],
	tasks: [],
	notes: [],
});

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

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

const parseRecurringInfo = (value: unknown): LRecurringInfo | undefined => {
	const info = asRecord(value);
	const type = asEnum(info.type, [
		LRECURRING_TYPE.DAILY,
		LRECURRING_TYPE.WEEKLY,
		LRECURRING_TYPE.MONTHLY,
		LRECURRING_TYPE.YEARLY,
	]);
	const time = asTrimmedString(info.time);
	if (!type || !time) {
		return undefined;
	}
	const normalizedTime = isValidLTimeString(time)
		? time
		: isValidLDateString(time)
			? time.slice(11)
			: undefined;
	if (!normalizedTime || !isValidLTimeString(normalizedTime)) {
		return undefined;
	}
	if (type === LRECURRING_TYPE.DAILY) {
		return {
			type,
			time: normalizedTime as any,
			weekDay: null,
			day: null,
			month: null,
		};
	}
	if (type === LRECURRING_TYPE.WEEKLY) {
		const weekDay = asInteger(info.weekDay);
		if (weekDay === undefined || weekDay < 0 || weekDay > 6) {
			return undefined;
		}
		return {
			type,
			time: normalizedTime as any,
			weekDay,
			day: null,
			month: null,
		};
	}
	if (type === LRECURRING_TYPE.MONTHLY) {
		const day = asInteger(info.day);
		if (day === undefined || day < 1 || day > 28) {
			return undefined;
		}
		return {
			type,
			time: normalizedTime as any,
			day,
			weekDay: null,
			month: null,
		};
	}
	const day = asInteger(info.day);
	const month = asInteger(info.month);
	if (
		day === undefined ||
		day < 1 ||
		day > 28 ||
		month === undefined ||
		month < 0 ||
		month > 11
	) {
		return undefined;
	}
	return {
		type: LRECURRING_TYPE.YEARLY,
		time: normalizedTime as any,
		day,
		month,
		weekDay: null,
	};
};

const cloneDeep = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const restoreLinks = async (links: Array<LLink>): Promise<void> => {
	for (const link of links) {
		await db.linkTbl.put(link);
	}
};

const captureDeleteNoteUndo = async (
	id: number,
): Promise<ToolUndoAction | undefined> => {
	const note = await db.noteTbl.get(id);
	if (!note) {
		return undefined;
	}
	const links = await db.linkTbl.where("noteId").equals(id).toArray();
	const noteSnapshot = cloneDeep(note);
	const linkSnapshot = cloneDeep(links);
	return {
		label: "Delete note",
		run: async () => {
			await db.noteTbl.put(noteSnapshot);
			await restoreLinks(linkSnapshot);
		},
	};
};

const captureDeleteReminderUndo = async (
	id: number,
): Promise<ToolUndoAction | undefined> => {
	const reminder = await db.reminderTbl.get(id);
	if (!reminder) {
		return undefined;
	}
	const reminderLinks = await db.linkTbl.where("reminderId").equals(id).toArray();
	const reminderSnapshot = cloneDeep(reminder);
	const linkSnapshot = cloneDeep(reminderLinks);
	return {
		label: "Delete reminder",
		run: async () => {
			await db.reminderTbl.put(reminderSnapshot);
			await restoreLinks(linkSnapshot);
		},
	};
};

const captureDeleteSaveUndo = async (
	id: number,
): Promise<ToolUndoAction | undefined> => {
	const save = await db.visualBMTbl.get(id);
	if (!save) {
		return undefined;
	}
	const saveLinks = await db.linkTbl.where("vbmId").equals(id).toArray();
	const noteIds = saveLinks
		.filter(
			(link) => link.type === LLINK_TYPE.NOTE_VBM && link.noteId !== null,
		)
		.map((link) => link.noteId!) as Array<number>;

	const notes = (
		await Promise.all(noteIds.map((noteId) => db.noteTbl.get(noteId)))
	).filter((note): note is NonNullable<typeof note> => note !== undefined);

	const noteLinks = (
		await Promise.all(noteIds.map((noteId) => db.linkTbl.where("noteId").equals(noteId).toArray()))
	).flat();

	const saveSnapshot = cloneDeep(save);
	const saveLinkSnapshot = cloneDeep(saveLinks);
	const noteSnapshot = cloneDeep(notes);
	const noteLinkSnapshot = cloneDeep(noteLinks);

	return {
		label: "Delete save",
		run: async () => {
			await db.visualBMTbl.put(saveSnapshot);
			for (const note of noteSnapshot) {
				await db.noteTbl.put(note);
			}
			await restoreLinks(noteLinkSnapshot);
			await restoreLinks(saveLinkSnapshot);
		},
	};
};

const captureDeleteTaskUndo = async (
	id: number,
): Promise<ToolUndoAction | undefined> => {
	const task = await db.taskTbl.get(id);
	if (!task) {
		return undefined;
	}
	const taskLinks = await db.linkTbl.where("taskId").equals(id).toArray();
	const reminderIds = taskLinks
		.filter(
			(link) =>
				link.type === LLINK_TYPE.REMINDER_TASK && link.reminderId !== null,
		)
		.map((link) => link.reminderId!) as Array<number>;

	const reminders = (
		await Promise.all(
			reminderIds.map((reminderId) => db.reminderTbl.get(reminderId)),
		)
	).filter(
		(reminder): reminder is LReminder => reminder !== undefined,
	);

	const reminderLinks = (
		await Promise.all(
			reminderIds.map((reminderId) =>
				db.linkTbl.where("reminderId").equals(reminderId).toArray(),
			),
		)
	).flat();

	const taskSnapshot = cloneDeep(task);
	const taskLinkSnapshot = cloneDeep(taskLinks);
	const reminderSnapshot = cloneDeep(reminders);
	const reminderLinkSnapshot = cloneDeep(reminderLinks);

	return {
		label: "Delete task",
		run: async () => {
			await db.taskTbl.put(taskSnapshot);
			for (const reminder of reminderSnapshot) {
				await db.reminderTbl.put(reminder);
			}
			await restoreLinks(reminderLinkSnapshot);
			await restoreLinks(taskLinkSnapshot);
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
		throw new Error(
			`${fieldName} must be in YYYY-MM-DDTHH:mm:ssZ format.`,
		);
	}
	return dateValue;
};

const requireId = (value: unknown, fieldName = "id"): number => {
	const id = asInteger(value);
	if (id === undefined) {
		throw new Error(`${fieldName} is required.`);
	}
	return id;
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
	/\s+(?:for|on)\s+(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{4}-\d{2}-\d{2}|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday).*/i;

const sanitizeReminderMessage = (
	value: string,
	targetDate?: LDate,
): string => {
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

const toModelNote = (note: {
	id: number;
	content: string;
	lastModificationDate: string;
}) => ({
	id: note.id,
	content: note.content,
	lastModificationDate: note.lastModificationDate,
});

const toModelSave = (save: {
	id: number;
	customName: string;
	title: string;
	url: string;
	lastBrowseDate: string;
	isSaved: number;
}) => ({
	id: save.id,
	name: save.customName,
	title: save.title,
	url: save.url,
	lastBrowseDate: save.lastBrowseDate,
	isSaved: save.isSaved === 1,
});

const toModelReminder = (reminder: {
	id: number;
	message: string;
	targetDate: string;
	type: string;
}) => ({
	id: reminder.id,
	message: reminder.message,
	targetDate: reminder.targetDate,
	type: reminder.type,
});

const toModelTask = (task: {
	id: number;
	label: string;
	information: string;
	priority: string;
	schedule: unknown;
	finishDate: string | null;
}) => ({
	id: task.id,
	label: task.label,
	information: task.information,
	priority: task.priority,
	schedule: task.schedule,
	finishDate: task.finishDate,
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
			const rawMessage =
				asTrimmedString(args.message) ??
				asTrimmedString(args.content) ??
				asTrimmedString(args.text);
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
		tool: deleteNoteTool,
		safety: SAFETY.destructive,
		normalizeArgs: (args) => ({
			id: asInteger(args.id),
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
			id: asInteger(args.id),
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
			id: asInteger(args.id),
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
			id: asInteger(args.id),
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
				asEnum(args.type, [LEXPORT_TYPE.READABLE, LEXPORT_TYPE.IMPORTABLE]) ??
				LEXPORT_TYPE.READABLE,
		}),
		execute: async (args) => {
			const type =
				asEnum(args.type, [LEXPORT_TYPE.READABLE, LEXPORT_TYPE.IMPORTABLE]) ??
				LEXPORT_TYPE.READABLE;
			const action = await toolCalls.exportData({ type });
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
			const year = requireId(args.year, "year");
			const month = requireId(args.month, "month");
			const day = requireId(args.day, "day");
			const hour = requireId(args.hour, "hour");
			const minute = requireId(args.minute, "minute");
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
				message:
					`Overview: ${overview.tasks.pending} pending tasks, ${overview.reminders.upcoming} upcoming reminders, ${overview.saves.total} saves, ${overview.notes.total} notes.`,
				modelPayload: overview,
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			};
		},
	},
	{
		tool: getSavePreviewImageTool,
		safety: SAFETY.read,
		normalizeArgs: (args) => ({
			id: asInteger(args.id),
			url: asTrimmedString(args.url),
			query: asTrimmedString(args.query),
		}),
		execute: async (args) => {
			const preview = await toolCalls.getSavePreviewImage({
				id: asInteger(args.id),
				url: asTrimmedString(args.url),
				query: asTrimmedString(args.query),
			});
			const saveName = preview.save.customName || preview.save.title || "save";
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
			const notes = await toolCalls.searchNotes(context.ai as any, query);
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
			const reminders = await toolCalls.searchReminders(context.ai as any, {
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
			const saves = await toolCalls.searchSaves(context.ai as any, {
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
			scheduleType: asEnum(args.scheduleType, [
				LTASK_SCHEDULE_TYPE.ADHOC,
				LTASK_SCHEDULE_TYPE.DUE,
				LTASK_SCHEDULE_TYPE.RECURRING,
			]),
			recurringInfo: parseRecurringInfo(args.recurringInfo),
			deadlineDate: asDateString(args.deadlineDate),
			deadlineDateCriteria: asDateCriteria(args.deadlineDateCriteria),
			finishDate: asDateString(args.finishDate),
			finishDateCriteria: asDateCriteria(args.finishDateCriteria),
		}),
		execute: async (args, context) => {
			const tasks = await toolCalls.searchTasks(context.ai as any, {
				query: asString(args.query),
				priority: asEnum(args.priority, [
					LTASK_PRIORITY.LOW,
					LTASK_PRIORITY.MEDIUM,
					LTASK_PRIORITY.HIGH,
				]),
				scheduleType: asEnum(args.scheduleType, [
					LTASK_SCHEDULE_TYPE.ADHOC,
					LTASK_SCHEDULE_TYPE.DUE,
					LTASK_SCHEDULE_TYPE.RECURRING,
				]),
				recurringInfo: parseRecurringInfo(args.recurringInfo),
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
			id: asInteger(args.id),
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
				asTrimmedString(args.targetDate) ?? asTrimmedString(args.targetTS);
			const targetDate = asDateString(targetDateInput);
			return {
				id: asInteger(args.id),
				message: (() => {
					const rawMessage =
						asTrimmedString(args.message) ??
						asTrimmedString(args.content) ??
						asTrimmedString(args.text);
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
			const existingReminder = await db.reminderTbl.get(id);
			if (!existingReminder) {
				throw new Error("Reminder not found.");
			}
			if (args.targetDateInvalid === true) {
				throw new Error(
					"targetDate must be in YYYY-MM-DDTHH:mm:ssZ format.",
				);
			}
			const nextTargetDate =
				asDateString(args.targetDate) ?? existingReminder.targetDate;
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

export {
	createEmptyOutputContent,
	toolRegistry,
	tools,
};

export type {
	ToolDefinition,
	ToolExecutionContext,
	ToolExecutionResult,
	ToolUndoAction,
};
