import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
	LINT_BOOLEAN,
	LREMINDER_TYPE,
	LTASK_PRIORITY,
	LTASK_SCHEDULE_TYPE,
} from "little-shared/enums";
import { LDateUtl } from "little-shared/utils/datetime";
import { resetLLDB, db } from "../../src/utils/db";
import { toolRegistry } from "../../src/services/ai/toolRegistry";

const aiContext = {
	ai: {
		getStructuredResponse: async () => ({ ids: [] }),
	},
};

const getTool = (name: string) => {
	const definition = toolRegistry.get(name);
	expect(definition).toBeDefined();
	return definition!;
};

describe.sequential("ai tool execution coverage", () => {
	beforeEach(async () => {
		await resetLLDB();
	});

	it("handles note create/search/update/delete+undo", async () => {
		const createNote = getTool("create_note");
		await createNote.execute(
			createNote.normalizeArgs({ content: "Buy groceries" }),
			aiContext,
		);

		const note = (await db.noteTbl.toArray())[0];
		expect(note.content).toContain("Buy groceries");

		const searchNotes = getTool("search_notes");
		const searchResult = await searchNotes.execute(
			searchNotes.normalizeArgs({ query: "groceries" }),
			aiContext,
		);
		expect(searchResult.message).toContain("Found");
		expect(searchResult.modelPayload).toMatchObject({
			total: 1,
		});

		const updateNote = getTool("update_note");
		await updateNote.execute(
			updateNote.normalizeArgs({
				id: note.id,
				content: "Buy groceries and milk",
			}),
			aiContext,
		);
		expect((await db.noteTbl.get(note.id))?.content).toContain("milk");

		const deleteNote = getTool("delete_note");
		const deleteResult = await deleteNote.execute(
			deleteNote.normalizeArgs({ id: note.id }),
			aiContext,
		);
		expect(await db.noteTbl.get(note.id)).toBeUndefined();
		expect(deleteResult.undoAction).toBeDefined();
		await deleteResult.undoAction!.run();
		expect(await db.noteTbl.get(note.id)).toBeDefined();
	});

	it("handles reminder create/search/update/delete+undo with formatted datetime", async () => {
		const formatDateTime = getTool("format_date_time");
		const formatted = await formatDateTime.execute(
			formatDateTime.normalizeArgs({
				year: 2026,
				month: 4,
				day: 7,
				hour: 9,
				minute: 30,
				second: 0,
			}),
			aiContext,
		);
		const targetDate = (
			formatted.modelPayload as { dateTime: string } | undefined
		)?.dateTime;
		expect(targetDate).toMatch(/^2026-04-07T09:30:00[+-]\d{2}:\d{2}$/);

		const createReminder = getTool("create_reminder");
		await createReminder.execute(
			createReminder.normalizeArgs({
				message: "Submit report",
				targetDate,
				type: LREMINDER_TYPE.NORMAL,
			}),
			aiContext,
		);
		await createReminder.execute(
			createReminder.normalizeArgs({
				message: "Submit invoices",
				targetDate: "2026-04-07T18:45:00+05:30",
				type: LREMINDER_TYPE.NORMAL,
			}),
			aiContext,
		);
		await createReminder.execute(
			createReminder.normalizeArgs({
				message: "Doctor appointment for April 7 2026 at 10:30 AM",
				targetDate: "2026-04-07T10:30:00+05:30",
				type: LREMINDER_TYPE.NORMAL,
			}),
			aiContext,
		);
		const reminder = (await db.reminderTbl.toArray())[0];
		expect(reminder.message).toBe("Submit report");
		expect(
			(await db.reminderTbl.toArray()).some(
				(item) => item.message === "Doctor appointment",
			),
		).toBe(true);

		const searchReminders = getTool("search_reminders");
		const searchResult = await searchReminders.execute(
			searchReminders.normalizeArgs({ query: "report" }),
			aiContext,
		);
		expect(searchResult.modelPayload).toMatchObject({
			total: 1,
		});

		const searchByDatePartsResult = await searchReminders.execute(
			searchReminders.normalizeArgs({
				targetDate: "2026-04-07T09:30:00+05:30",
				targetDateCriteria: {
					year: true,
					month: true,
					day: true,
				},
			}),
			aiContext,
		);
		expect(searchByDatePartsResult.modelPayload).toMatchObject({
			total: 3,
		});

		const updateReminder = getTool("update_reminder");
		await updateReminder.execute(
			updateReminder.normalizeArgs({
				id: reminder.id,
				message: "Submit weekly report",
			}),
			aiContext,
		);
		expect((await db.reminderTbl.get(reminder.id))?.message).toContain(
			"weekly",
		);
		await updateReminder.execute(
			updateReminder.normalizeArgs({
				id: reminder.id,
				message: "Submit weekly report on April 7 2026 at 9:30 AM",
				targetDate: "2026-04-07T09:30:00+05:30",
			}),
			aiContext,
		);
		expect((await db.reminderTbl.get(reminder.id))?.message).toBe(
			"Submit weekly report",
		);

		const deleteReminder = getTool("delete_reminder");
		const deleteResult = await deleteReminder.execute(
			deleteReminder.normalizeArgs({ id: reminder.id }),
			aiContext,
		);
		expect(await db.reminderTbl.get(reminder.id)).toBeUndefined();
		await deleteResult.undoAction!.run();
		expect(await db.reminderTbl.get(reminder.id)).toBeDefined();
	});

	it("handles task search/delete+undo", async () => {
		const taskId = await db.taskTbl.add({
			information: "Prepare sprint plan",
			label: "Sprint planning",
			priority: LTASK_PRIORITY.MEDIUM,
			schedule: {
				type: LTASK_SCHEDULE_TYPE.ADHOC,
				deadlineInfo: null,
				recurringInfo: null,
			},
			finishDate: null,
		});
		await db.taskTbl.add({
			information: "Review team retrospective",
			label: "Retro review",
			priority: LTASK_PRIORITY.MEDIUM,
			schedule: {
				type: LTASK_SCHEDULE_TYPE.DUE,
				deadlineInfo: {
					deadlineDate: "2026-05-01T20:15:00+05:30",
				},
				recurringInfo: null,
			},
			finishDate: null,
		});
		const task = (await db.taskTbl.get(taskId))!;
		expect(task.label).toBe("Sprint planning");

		const searchTasks = getTool("search_tasks");
		const searchResult = await searchTasks.execute(
			searchTasks.normalizeArgs({ query: "sprint" }),
			aiContext,
		);
		expect(searchResult.modelPayload).toMatchObject({
			total: 1,
		});

		const searchByDeadlineDate = await searchTasks.execute(
			searchTasks.normalizeArgs({
				deadlineDate: "2026-05-01T08:10:00+05:30",
				deadlineDateCriteria: {
					year: true,
					month: true,
					day: true,
				},
			}),
			aiContext,
		);
		expect(searchByDeadlineDate.modelPayload).toMatchObject({
			total: 1,
		});

		const deleteTask = getTool("delete_task");
		const deleteResult = await deleteTask.execute(
			deleteTask.normalizeArgs({ id: task.id }),
			aiContext,
		);
		expect(await db.taskTbl.get(task.id)).toBeUndefined();
		await deleteResult.undoAction!.run();
		expect(await db.taskTbl.get(task.id)).toBeDefined();
	});

	it("rejects malformed payload formats for reminders", async () => {
		const createReminder = getTool("create_reminder");
		await expect(
			createReminder.execute(
				createReminder.normalizeArgs({
					message: "Bad reminder date",
					targetDate: "not-a-date",
				}),
				aiContext,
			),
		).rejects.toThrow(/targetDate/i);

		await createReminder.execute(
			createReminder.normalizeArgs({
				message: "Valid reminder",
				targetDate: "2026-06-01T10:00:00+05:30",
				type: LREMINDER_TYPE.NORMAL,
			}),
			aiContext,
		);
		const reminder = (await db.reminderTbl.toArray())[0];

		const updateReminder = getTool("update_reminder");
		await expect(
			updateReminder.execute(
				updateReminder.normalizeArgs({
					id: reminder.id,
					targetDate: "later",
				}),
				aiContext,
			),
		).rejects.toThrow(/targetDate/i);
	});

	it("handles save search/delete+undo and preview image fetch", async () => {
		const saveId = await db.visualBMTbl.add({
			customName: "Example Save",
			hasBrowsed: LINT_BOOLEAN.TRUE,
			isSaved: LINT_BOOLEAN.TRUE,
			lastBrowseDate: LDateUtl.getNow(),
			title: "Example",
			url: "https://example.com",
		});
		await db.vbmPreviewTbl.put({
			vbmId: saveId,
			blob: {
				type: "image/png",
				data: Array.from(new TextEncoder().encode("preview")),
			} as unknown as Blob,
		});

		const searchSaves = getTool("search_saves");
		const searchResult = await searchSaves.execute(
			searchSaves.normalizeArgs({ query: "example" }),
			aiContext,
		);
		expect(searchResult.modelPayload).toMatchObject({
			total: 1,
		});

		const previewTool = getTool("get_save_preview_image");
		const previewResult = await previewTool.execute(
			previewTool.normalizeArgs({ id: saveId }),
			aiContext,
		);
		expect(previewResult.message).toContain("![");
		expect(previewResult.message).toMatch(
			/\]\((blob:|data:image\/)/,
		);

		const deleteSave = getTool("delete_save");
		const deleteResult = await deleteSave.execute(
			deleteSave.normalizeArgs({ id: saveId }),
			aiContext,
		);
		expect((await db.visualBMTbl.get(saveId))?.isSaved).toBe(
			LINT_BOOLEAN.FALSE,
		);
		await deleteResult.undoAction!.run();
		expect((await db.visualBMTbl.get(saveId))?.isSaved).toBe(
			LINT_BOOLEAN.TRUE,
		);
	});

	it("handles recent history and productivity overview helpers", async () => {
		const nowDate = LDateUtl.getNow();
		const yesterdayDate = LDateUtl.shiftDay(nowDate, -1);
		const tomorrowDate = LDateUtl.shiftDay(nowDate, 1);

		await db.visualBMTbl.bulkAdd([
			{
				customName: "Recent One",
				hasBrowsed: LINT_BOOLEAN.TRUE,
				isSaved: LINT_BOOLEAN.TRUE,
				lastBrowseDate: nowDate,
				title: "Recent One",
				url: "https://recent-one.test",
			},
			{
				customName: "Old One",
				hasBrowsed: LINT_BOOLEAN.TRUE,
				isSaved: LINT_BOOLEAN.FALSE,
				lastBrowseDate: yesterdayDate,
				title: "Old One",
				url: "https://old-one.test",
			},
		]);
		await db.noteTbl.add({
			content: "Test note",
		});
		await db.reminderTbl.add({
			message: "Future reminder",
			targetDate: tomorrowDate,
			type: LREMINDER_TYPE.NORMAL,
			lastNotificationDate: null,
		});
		await db.taskTbl.add({
			label: "Critical",
			information: "Ship fix",
			priority: LTASK_PRIORITY.HIGH,
			schedule: {
				type: LTASK_SCHEDULE_TYPE.DUE,
				deadlineInfo: {
					deadlineDate: yesterdayDate,
				},
				recurringInfo: null,
			},
			finishDate: null,
		});

		const recentHistory = getTool("get_recent_history");
		const historyResult = await recentHistory.execute(
			recentHistory.normalizeArgs({ limit: 1 }),
			aiContext,
		);
		expect(historyResult.modelPayload).toMatchObject({
			total: 1,
			results: [{ name: "Recent One" }],
		});

		const overviewTool = getTool("get_productivity_overview");
		const overviewResult = await overviewTool.execute(
			overviewTool.normalizeArgs({}),
			aiContext,
		);
		expect(overviewResult.modelPayload).toMatchObject({
			notes: { total: 1 },
			saves: { total: 1 },
			history: { total: 2 },
			reminders: { total: 1, upcoming: 1 },
			tasks: { total: 1, pending: 1, highPriorityPending: 1, overdueDueTasks: 1 },
		});
	});
});
