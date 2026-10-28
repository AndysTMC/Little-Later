import { LTASK_PRIORITY } from "little-shared/enums";
import { LDate } from "little-shared/types";
import { send } from "../../../utils/send";
import { fromModelDate } from "./_utils/dateFilters";

// A task with a deadline gets a normal reminder at it, as before format v1.
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
		await send("task.create", {
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
				: { schedule: { kind: "anytime" }, reminder: null }),
		});
	};
};

export { toolCall as createTaskToolCall };
