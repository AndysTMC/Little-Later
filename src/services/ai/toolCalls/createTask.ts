import { LTASK_PRIORITY } from "little-shared/enums";
import { LDate } from "little-shared/types";
import type { RecurrenceRule } from "little-shared/utils/schedule";
import { fromModelDate } from "./_utils/dateFilters";
import type { AIOwner } from "../owner";

// A task with a deadline or recurring rule gets a normal reminder, matching
// the popup's defaults.
const toolCall = async (
	owner: AIOwner,
	{
		information,
		label,
		priority,
		deadlineDate,
		recurrence,
		tags,
	}: {
		information: string;
		label: string;
		priority?: LTASK_PRIORITY;
		deadlineDate?: LDate;
		recurrence?: RecurrenceRule;
		tags?: Array<string>;
	},
): Promise<() => Promise<void>> => {
	return async () => {
		const schedule = recurrence
			? ({ kind: "recurring", rule: recurrence } as const)
			: deadlineDate
				? ({
						kind: "due",
						at: fromModelDate(deadlineDate),
					} as const)
				: ({ kind: "anytime" } as const);
		await owner.send("task.create", {
			information,
			label,
			priority,
			schedule,
			reminder: schedule.kind === "anytime" ? null : "normal",
			...(tags && tags.length > 0 ? { tags } : {}),
		});
	};
};

export { toolCall as createTaskToolCall };
