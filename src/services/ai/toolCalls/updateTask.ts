import { LTASK_PRIORITY } from "little-shared/enums";
import { LDate } from "little-shared/types";
import { send } from "../../../utils/send";
import { readTasks, unlockedKeys } from "../records";
import { fromModelDate } from "./_utils/dateFilters";

// A new deadline makes the task due then, with a normal reminder at it, as
// before format v1.
const toolCall = async ({
	id,
	information,
	label,
	priority,
	deadlineDate,
}: {
	id: string;
	information?: string;
	label?: string;
	priority?: LTASK_PRIORITY;
	deadlineDate?: LDate;
}): Promise<() => Promise<void>> => {
	const task = (await readTasks(await unlockedKeys())).find(
		(item) => item.id === id,
	);
	if (task === undefined) {
		throw new Error("Task not found.");
	}
	return async () => {
		await send("task.update", {
			id,
			information,
			label,
			priority,
			...(deadlineDate
				? {
						schedule: {
							kind: "due",
							at: fromModelDate(deadlineDate),
						},
						reminder: "normal",
					}
				: {}),
		});
	};
};

export { toolCall as updateTaskToolCall };
