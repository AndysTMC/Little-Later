import { taskStatus } from "../../../popup/records";
import { readNotes, readReminders, readSaves, readTasks } from "../records";
import { toModelDate } from "./_utils/dateFilters";
import type { AIOwner } from "../owner";

const toolCall = async (
	owner: AIOwner,
): Promise<{
	generatedAt: string;
	notes: { total: number };
	saves: { total: number };
	history: { total: number };
	reminders: {
		total: number;
		upcoming: number;
		overdue: number;
		fired: number;
	};
	tasks: {
		total: number;
		pending: number;
		completed: number;
		highPriorityPending: number;
		overdueDueTasks: number;
	};
}> => {
	const keys = await owner.keys();
	const [notes, saves, reminders, tasks] = await Promise.all([
		readNotes(keys),
		readSaves(keys),
		readReminders(keys),
		readTasks(keys),
	]);
	const now = Date.now();
	const pendingTasks = tasks.filter((task) => !task.done);
	return {
		generatedAt: toModelDate(now),
		notes: {
			total: notes.length,
		},
		saves: {
			total: saves.filter((save) => save.saved).length,
		},
		history: {
			total: saves.filter((save) => save.browsed).length,
		},
		reminders: {
			total: reminders.length,
			// A reminder that has fired for the last time (nextFireAt 0) is
			// history, neither upcoming nor overdue.
			upcoming: reminders.filter(
				(reminder) =>
					reminder.nextFireAt !== 0 && reminder.target >= now,
			).length,
			overdue: reminders.filter(
				(reminder) =>
					reminder.nextFireAt !== 0 && reminder.target < now,
			).length,
			fired: reminders.filter((reminder) => reminder.nextFireAt === 0)
				.length,
		},
		tasks: {
			total: tasks.length,
			pending: pendingTasks.length,
			completed: tasks.length - pendingTasks.length,
			highPriorityPending: pendingTasks.filter(
				(task) => task.priority === "high",
			).length,
			overdueDueTasks: pendingTasks.filter(
				(task) => taskStatus(task, now) === "missed",
			).length,
		},
	};
};

export { toolCall as getProductivityOverviewToolCall };
