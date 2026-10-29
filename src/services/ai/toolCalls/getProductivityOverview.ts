import { taskStatus } from "../../../popup/records";
import {
	readNotes,
	readReminders,
	readSaves,
	readTasks,
	unlockedKeys,
} from "../records";
import { toModelDate } from "./_utils/dateFilters";

const toolCall = async (): Promise<{
	generatedAt: string;
	notes: { total: number };
	saves: { total: number };
	history: { total: number };
	reminders: { total: number; upcoming: number; overdue: number };
	tasks: {
		total: number;
		pending: number;
		completed: number;
		highPriorityPending: number;
		overdueDueTasks: number;
	};
}> => {
	const keys = await unlockedKeys();
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
			upcoming: reminders.filter((reminder) => reminder.target >= now)
				.length,
			overdue: reminders.filter((reminder) => reminder.target < now)
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
