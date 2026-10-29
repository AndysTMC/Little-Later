import { LREMINDER_TYPE } from "little-shared/enums";
import { LDate } from "little-shared/types";
import { send } from "../../../utils/send";
import { fromModelDate } from "./_utils/dateFilters";

const toolCall = async ({
	message,
	targetDate,
	type,
}: {
	message: string;
	targetDate: LDate;
	type: LREMINDER_TYPE;
}): Promise<() => Promise<void>> => {
	return async () => {
		await send("reminder.create", {
			message,
			target: fromModelDate(targetDate),
			escalate: type === LREMINDER_TYPE.ESCALATING,
		});
	};
};

export { toolCall as createReminderToolCall };
