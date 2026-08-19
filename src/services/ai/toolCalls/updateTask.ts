import {
	LREMINDER_TYPE,
	LTASK_PRIORITY,
	LTASK_SCHEDULE_TYPE,
} from "little-shared/enums";
import { LDate } from "little-shared/types";
import { getTask, putTask, updateTask } from "../../../services/task";

const toolCall = async ({
	id,
	information,
	label,
	priority,
	deadlineDate,
}: {
	id: number;
	information?: string;
	label?: string;
	priority?: LTASK_PRIORITY;
	deadlineDate?: LDate;
}): Promise<() => Promise<void>> => {
	const task = await getTask(id);
	if (task === undefined) {
		throw new Error("Task not found.");
	}
	return async () => {
		if (deadlineDate) {
			await putTask(
				{
					...task,
					information: information ?? task.information,
					label: label ?? task.label,
					priority: priority ?? task.priority,
					schedule: {
						type: LTASK_SCHEDULE_TYPE.DUE,
						deadlineInfo: { deadlineDate },
						recurringInfo: null,
					},
				},
				[],
				[],
				LREMINDER_TYPE.NORMAL,
			);
			return;
		}
		await updateTask(id, {
			information: information ?? task.information,
			label: label ?? task.label,
			priority: priority ?? task.priority,
		});
	};
};

export { toolCall as updateTaskToolCall };
