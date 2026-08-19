import {
	LREMINDER_TYPE,
	LTASK_PRIORITY,
	LTASK_SCHEDULE_TYPE,
} from "little-shared/enums";
import { LDate } from "little-shared/types";
import { createTask, putTask } from "../../../services/task";

const toolCall = async ({
	information,
	label,
	priority,
	deadlineDate,
}: {
	information: string;
	label: string;
	priority: LTASK_PRIORITY;
	deadlineDate?: LDate;
}): Promise<() => Promise<void>> => {
	return async () => {
		if (deadlineDate) {
			await putTask(
				{
					information,
					label,
					priority,
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
		await createTask({
			information,
			label,
			priority,
			schedule: {
				type: LTASK_SCHEDULE_TYPE.ADHOC,
				deadlineInfo: null,
				recurringInfo: null,
			},
		});
	};
};

export { toolCall as createTaskToolCall };
