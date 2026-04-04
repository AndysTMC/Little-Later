import { LTASK_PRIORITY } from "little-shared/enums";
import { createTask } from "../../../services/task";
import { LTaskSchedule } from "little-shared/types";

const toolCall = async ({
	information,
	label,
	priority,
	schedule,
}: {
	information: string;
	label: string;
	priority: LTASK_PRIORITY;
	schedule: LTaskSchedule;
}): Promise<() => Promise<void>> => {
	return async () => {
		await createTask({ information, label, priority, schedule });
	};
};

export { toolCall as createTaskToolCall };
