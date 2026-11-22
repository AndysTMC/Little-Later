import { LTASK_PRIORITY } from "little-shared/enums";
import { LDate } from "little-shared/types";
import { readTasks } from "../records";
import { fromModelDate } from "./_utils/dateFilters";
import type { AIOwner } from "../owner";

// A new deadline makes the task due then. Its reminder, if it has one,
// moves with it and keeps its kind: the confirmation shows only the new
// date, so nothing else may change. A repeating task is refused, since a
// date would end its repeat; its schedule is changed on its own page.
const toolCall = async (
	owner: AIOwner,
	{
		id,
		information,
		label,
		priority,
		deadlineDate,
		tags,
	}: {
		id: string;
		information?: string;
		label?: string;
		priority?: LTASK_PRIORITY;
		deadlineDate?: LDate;
		tags?: Array<string>;
	},
): Promise<() => Promise<void>> => {
	const task = (await readTasks(await owner.keys())).find(
		(item) => item.id === id,
	);
	if (task === undefined) {
		throw new Error("Task not found.");
	}
	if (deadlineDate && task.schedule.kind === "recurring") {
		throw new Error(
			"This task repeats, and a single due date would end its repeat. Change its schedule on the task's page instead.",
		);
	}
	return async () => {
		await owner.send("task.update", {
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
					}
				: {}),
			...(tags !== undefined ? { tags } : {}),
		});
	};
};

export { toolCall as updateTaskToolCall };
