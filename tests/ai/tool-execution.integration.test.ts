// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LREMINDER_TYPE, LTASK_PRIORITY } from "little-shared/enums";
import {
	LMAX_TASK_INFORMATION_LENGTH,
	LMAX_TASK_LABEL_LENGTH,
} from "little-shared/constants";
import { toolRegistry } from "../../src/services/ai/toolRegistry";
import {
	readLinks,
	readNotes,
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
// browser global; it is replaced with the v1 backup in its own change.
vi.mock("../../src/services/dataExchange", () => ({}));

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

const keys = () => unlockedKeys();
const notes = async () => readNotes(await keys());
const reminders = async () => readReminders(await keys());
const saves = async () => readSaves(await keys());
const tasks = async () => readTasks(await keys());

const DAY = 24 * 60 * 60 * 1000;

describe("ai tool execution coverage", { concurrent: false }, () => {
	beforeEach(async () => {
		// The April dates below stay in the future.
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
		await freshProfile();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("handles note create/search/update/delete+undo", async () => {
		const createNote = getTool("create_note");
		await createNote.execute(
			createNote.normalizeArgs({ content: "Buy groceries" }),
			aiContext,
		);

		const [note] = await notes();
		expect(note.content).toContain("Buy groceries");

		const searchNotes = getTool("search_notes");
		const searchResult = await searchNotes.execute(
			searchNotes.normalizeArgs({ query: "groceries" }),
			aiContext,
		);
		expect(searchResult.message).toContain("Found");
		expect(searchResult.modelPayload).toMatchObject({
			total: 1,
			results: [
				{ id: note.id, lastModificationDate: expect.any(String) },
			],
		});

		const updateNote = getTool("update_note");
		await updateNote.execute(
			updateNote.normalizeArgs({
				id: note.id,
				content: "Buy groceries and milk",
			}),
			aiContext,
		);
		expect((await notes())[0].content).toContain("milk");

		const deleteNote = getTool("delete_note");
		const deleteResult = await deleteNote.execute(
			deleteNote.normalizeArgs({ id: note.id }),
			aiContext,
		);
		expect(await notes()).toEqual([]);
		expect(deleteResult.undoAction).toBeDefined();
		await deleteResult.undoAction!.run();
		expect(await notes()).toMatchObject([
			{ content: "Buy groceries and milk" },
		]);
	});

	it("brings a deleted note back attached to its save", async () => {
		const { id: saveId } = await send("save.capture", {
			url: "https://example.com/",
			title: "Example",
			saved: true,
		});
		await send("note.create", { content: "About example", saveId });
		const [note] = await notes();

		const deleteNote = getTool("delete_note");
		const deleteResult = await deleteNote.execute(
			deleteNote.normalizeArgs({ id: note.id }),
			aiContext,
		);
		await deleteResult.undoAction!.run();
		const [restored] = await notes();
		expect(await readLinks(await keys())).toMatchObject([
			{ fromId: restored.id, toId: saveId },
		]);
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
		expect(targetDate).toMatch(/^2026-04-07T09:30:00([+-]\d{2}:\d{2}|Z)$/);
		expect(targetDate).toBe(localDate("2026-04-07T09:30:00"));

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
				targetDate: localDate("2026-04-07T18:45:00"),
				type: LREMINDER_TYPE.NORMAL,
			}),
			aiContext,
		);
		await createReminder.execute(
			createReminder.normalizeArgs({
				message: "Doctor appointment for April 7 2026 at 10:30 AM",
				targetDate: localDate("2026-04-07T10:30:00"),
				type: LREMINDER_TYPE.ESCALATING,
			}),
			aiContext,
		);
		const reminder = (await reminders()).find(
			(item) => item.message === "Submit report",
		)!;
		expect(reminder).toBeDefined();
		expect(
			(await reminders()).find(
				(item) => item.message === "Doctor appointment",
			)?.escalation,
		).not.toBeNull();

		const searchReminders = getTool("search_reminders");
		const searchResult = await searchReminders.execute(
			searchReminders.normalizeArgs({ query: "report" }),
			aiContext,
		);
		expect(searchResult.modelPayload).toMatchObject({
			total: 1,
			results: [{ id: reminder.id, targetDate, type: "normal" }],
		});

		const searchByDatePartsResult = await searchReminders.execute(
			searchReminders.normalizeArgs({
				targetDate: localDate("2026-04-07T23:00:00"),
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
		const searchByInstant = await searchReminders.execute(
			searchReminders.normalizeArgs({ targetDate }),
			aiContext,
		);
		expect(searchByInstant.modelPayload).toMatchObject({ total: 1 });

		const updateReminder = getTool("update_reminder");
		await updateReminder.execute(
			updateReminder.normalizeArgs({
				id: reminder.id,
				message: "Submit weekly report",
			}),
			aiContext,
		);
		expect(
			(await reminders()).find((item) => item.id === reminder.id)
				?.message,
		).toContain("weekly");
		await updateReminder.execute(
			updateReminder.normalizeArgs({
				id: reminder.id,
				message: "Submit weekly report on April 7 2026 at 9:30 AM",
				targetDate: localDate("2026-04-08T09:30:00"),
			}),
			aiContext,
		);
		expect(
			(await reminders()).find((item) => item.id === reminder.id),
		).toMatchObject({
			message: "Submit weekly report",
			target: Date.parse(localDate("2026-04-08T09:30:00")),
		});

		const deleteReminder = getTool("delete_reminder");
		const deleteResult = await deleteReminder.execute(
			deleteReminder.normalizeArgs({ id: reminder.id }),
			aiContext,
		);
		expect(
			(await reminders()).some((item) => item.id === reminder.id),
		).toBe(false);
		await deleteResult.undoAction!.run();
		expect(
			(await reminders()).some(
				(item) => item.message === "Submit weekly report",
			),
		).toBe(true);
	});

	it("creates and updates tasks, and rejects invalid or missing records", async () => {
		const createTask = getTool("create_task");
		const deadline = localDate("2026-04-08T08:00:00");
		await createTask.execute(
			createTask.normalizeArgs({
				information: "Pay April rent",
				label: "Rent",
				priority: LTASK_PRIORITY.HIGH,
				deadlineDate: deadline,
			}),
			aiContext,
		);
		const created = (await tasks()).find((task) => task.label === "Rent");
		expect(created).toMatchObject({
			priority: "high",
			schedule: { kind: "due", at: Date.parse(deadline) },
		});
		// A deadline brings a reminder at it, linked to the task.
		expect(await reminders()).toMatchObject([
			{ message: "Pay April rent", target: Date.parse(deadline) },
		]);
		expect(await readLinks(await keys())).toMatchObject([
			{ toId: created!.id },
		]);

		const updateTask = getTool("update_task");
		await updateTask.execute(
			updateTask.normalizeArgs({
				id: created!.id,
				label: "Rent due",
				priority: LTASK_PRIORITY.MEDIUM,
			}),
			aiContext,
		);
		expect(
			(await tasks()).find((task) => task.id === created!.id),
		).toMatchObject({ label: "Rent due", priority: "medium" });

		await expect(
			createTask.execute(
				createTask.normalizeArgs({
					information: "Bad date",
					deadlineDate: "tomorrow",
				}),
				aiContext,
			),
		).rejects.toThrow(/deadlineDate/i);

		await expect(
			updateTask.execute(
				updateTask.normalizeArgs({
					id: "missing",
					label: "Missing",
				}),
				aiContext,
			),
		).rejects.toThrow(/not found/i);

		await createTask.execute(
			createTask.normalizeArgs({
				information: "x".repeat(400),
				label: "This label is way too long for the field",
			}),
			aiContext,
		);
		const clamped = (await tasks()).find((task) =>
			task.information.startsWith("xxx"),
		);
		expect(clamped?.information).toHaveLength(LMAX_TASK_INFORMATION_LENGTH);
		expect(clamped?.label).toHaveLength(LMAX_TASK_LABEL_LENGTH);
		expect(clamped?.schedule).toEqual({ kind: "anytime" });
	});

	it("handles task search/delete+undo", async () => {
		const { id: taskId } = await send("task.create", {
			information: "Prepare sprint plan",
			label: "Sprint planning",
			priority: "medium",
			schedule: { kind: "anytime" },
			reminder: null,
		});
		await send("task.create", {
			information: "Review team retrospective",
			label: "Retro review",
			priority: "medium",
			schedule: {
				kind: "due",
				at: Date.parse(localDate("2026-05-01T20:15:00")),
			},
			reminder: "escalating",
		});

		const searchTasks = getTool("search_tasks");
		const searchResult = await searchTasks.execute(
			searchTasks.normalizeArgs({ query: "sprint" }),
			aiContext,
		);
		expect(searchResult.modelPayload).toMatchObject({
			total: 1,
			results: [
				{
					id: taskId,
					schedule: { type: "anytime" },
					deadlineDate: null,
					finished: false,
				},
			],
		});

		const searchByDeadlineDate = await searchTasks.execute(
			searchTasks.normalizeArgs({
				deadlineDate: localDate("2026-05-01T08:10:00"),
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

		// "ad-hoc" is the old name for tasks without a deadline.
		const searchAdHoc = await searchTasks.execute(
			searchTasks.normalizeArgs({ scheduleType: "ad-hoc" }),
			aiContext,
		);
		expect(searchAdHoc.modelPayload).toMatchObject({ total: 1 });

		const retro = (await tasks()).find(
			(task) => task.label === "Retro review",
		)!;
		const deleteTask = getTool("delete_task");
		const deleteResult = await deleteTask.execute(
			deleteTask.normalizeArgs({ id: retro.id }),
			aiContext,
		);
		expect((await tasks()).some((task) => task.id === retro.id)).toBe(
			false,
		);
		expect(await reminders()).toEqual([]);
		await deleteResult.undoAction!.run();
		expect(
			(await tasks()).find((task) => task.label === "Retro review"),
		).toMatchObject({ schedule: retro.schedule });
		// Its reminder comes back with it.
		expect(await reminders()).toMatchObject([
			{ message: "Review team retrospective", target: retro.dueAt },
		]);
		expect((await reminders())[0].escalation).not.toBeNull();
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
				targetDate: localDate("2026-06-01T10:00:00"),
				type: LREMINDER_TYPE.NORMAL,
			}),
			aiContext,
		);
		const [reminder] = await reminders();

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

	it("updates saves and rejects missing records", async () => {
		const { id: saveId } = await send("save.capture", {
			url: "https://rename-me.example.com/",
			title: "Old Name",
			saved: true,
		});

		const updateSave = getTool("update_save");
		await updateSave.execute(
			updateSave.normalizeArgs({
				id: saveId,
				customName: "New Name",
			}),
			aiContext,
		);
		expect((await saves())[0].customName).toBe("New Name");

		await expect(
			updateSave.execute(
				updateSave.normalizeArgs({
					id: "missing",
					customName: "Ghost",
				}),
				aiContext,
			),
		).rejects.toThrow(/not found/i);
	});

	it("handles save search/delete+undo and preview image fetch", async () => {
		const { id: saveId } = await send("save.capture", {
			url: "https://example.com/",
			title: "Example Save",
			saved: true,
		});
		await send("task.create", {
			information: "Read example",
			schedule: { kind: "anytime" },
			reminder: null,
			saveId,
		});
		await putPreview(
			littleDB,
			await keys(),
			saveId,
			new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
			Date.now(),
		);

		const searchSaves = getTool("search_saves");
		const searchResult = await searchSaves.execute(
			searchSaves.normalizeArgs({ query: "example" }),
			aiContext,
		);
		expect(searchResult.modelPayload).toMatchObject({
			total: 1,
			results: [{ id: saveId, isSaved: true }],
		});

		const previewTool = getTool("get_save_preview_image");
		const previewResult = await previewTool.execute(
			previewTool.normalizeArgs({ id: saveId }),
			aiContext,
		);
		expect(previewResult.message).toContain("![");
		expect(previewResult.message).toMatch(/\]\((blob:|data:image\/)/);

		const deleteSave = getTool("delete_save");
		const deleteResult = await deleteSave.execute(
			deleteSave.normalizeArgs({ id: saveId }),
			aiContext,
		);
		expect((await saves())[0].saved).toBe(false);
		expect(await readLinks(await keys())).toEqual([]);
		await deleteResult.undoAction!.run();
		expect((await saves())[0].saved).toBe(true);
		// Its task is attached again.
		expect(await readLinks(await keys())).toMatchObject([{ toId: saveId }]);
	});

	it("handles recent history and productivity overview helpers", async () => {
		await send("save.capture", {
			url: "https://old-one.test/",
			title: "Old One",
		});
		vi.setSystemTime(Date.now() + 1000);
		await send("save.capture", {
			url: "https://recent-one.test/",
			title: "Recent One",
			saved: true,
		});
		await send("note.create", { content: "Test note" });
		await send("reminder.create", {
			message: "Future reminder",
			target: Date.now() + DAY,
		});
		await send("task.create", {
			label: "Critical",
			information: "Ship fix",
			priority: "high",
			schedule: { kind: "due", at: Date.now() + DAY },
			reminder: null,
		});
		vi.setSystemTime(Date.now() + 2 * DAY);

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
			reminders: { total: 1, upcoming: 0, overdue: 1 },
			tasks: {
				total: 1,
				pending: 1,
				highPriorityPending: 1,
				overdueDueTasks: 1,
			},
		});
	});
});
