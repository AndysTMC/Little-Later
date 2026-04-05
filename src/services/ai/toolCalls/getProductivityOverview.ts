import {
	LINT_BOOLEAN,
	LTASK_PRIORITY,
	LTASK_SCHEDULE_TYPE,
} from "little-shared/enums";
import { LDateUtl } from "little-shared/utils/datetime";
import { db } from "../../../utils/db";

const isFutureDate = (value: string): boolean => {
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) && parsed >= Date.now();
};

const isPastDate = (value: string): boolean => {
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) && parsed < Date.now();
};

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
	const [notes, saves, reminders, tasks] = await Promise.all([
		db.noteTbl.toArray(),
		db.visualBMTbl.toArray(),
		db.reminderTbl.toArray(),
		db.taskTbl.toArray(),
	]);

	const completedTasks = tasks.filter((task) => task.finishDate !== null);
	const pendingTasks = tasks.filter((task) => task.finishDate === null);
	const overdueDueTasks = pendingTasks.filter((task) => {
		if (
			task.schedule.type !== LTASK_SCHEDULE_TYPE.DUE ||
			!task.schedule.deadlineInfo?.deadlineDate
		) {
			return false;
		}
		return isPastDate(task.schedule.deadlineInfo.deadlineDate);
	});

	return {
		generatedAt: LDateUtl.getNow(),
		notes: {
			total: notes.length,
		},
		saves: {
			total: saves.filter((save) => save.isSaved === LINT_BOOLEAN.TRUE).length,
		},
		history: {
			total: saves.filter((save) => save.hasBrowsed === LINT_BOOLEAN.TRUE).length,
		},
		reminders: {
			total: reminders.length,
			upcoming: reminders.filter((reminder) => isFutureDate(reminder.targetDate))
				.length,
			overdue: reminders.filter((reminder) => isPastDate(reminder.targetDate))
				.length,
		},
		tasks: {
			total: tasks.length,
			pending: pendingTasks.length,
			completed: completedTasks.length,
			highPriorityPending: pendingTasks.filter(
				(task) => task.priority === LTASK_PRIORITY.HIGH,
			).length,
			overdueDueTasks: overdueDueTasks.length,
		},
	};
};

export { toolCall as getProductivityOverviewToolCall };
