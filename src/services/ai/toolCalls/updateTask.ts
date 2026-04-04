import { LTASK_PRIORITY } from "little-shared/enums";
import { getTask, updateTask } from "../../../services/task";
import { LTaskSchedule } from "little-shared/types";

const toolCall = async (
	id: number,
	{
		information,
		label,
		priority,
		schedule,
	}: {
		information?: string;
		label?: string;
		priority?: LTASK_PRIORITY;
		schedule?: LTaskSchedule;
	},
): Promise<() => Promise<void>> => {
	const task = await getTask(id);
	if (task === undefined) {
		throw new Error("Task not found.");
	}
	const modifiedTask = {
		...task,
		information: information ?? task.information,
		label: label ?? task.label,
		priority: priority ?? task.priority,
		schedule: schedule ?? task.schedule,
	};
	return async () => {
		await updateTask(task.id, modifiedTask);
	};
};

export { toolCall as updateTaskToolCall };
