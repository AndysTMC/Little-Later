import { LREMINDER_TYPE } from "little-shared/enums";
import { LDate } from "little-shared/types";
import { fromModelDate } from "./_utils/dateFilters";
import type { AIOwner } from "../owner";

const toolCall = async (
	owner: AIOwner,
	{
		message,
		targetDate,
		type,
	}: {
		message: string;
		targetDate: LDate;
		type: LREMINDER_TYPE;
	},
): Promise<() => Promise<void>> => {
	return async () => {
		await owner.send("reminder.create", {
			message,
			target: fromModelDate(targetDate),
			escalate: type === LREMINDER_TYPE.ESCALATING,
		});
	};
};

export { toolCall as createReminderToolCall };
