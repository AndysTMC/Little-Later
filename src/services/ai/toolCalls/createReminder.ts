import { LREMINDER_TYPE } from "little-shared/enums";
import { createReminder } from "../../../services/reminder";
import { LDate } from "little-shared/types";

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
		await createReminder({ message, type, targetDate });
	};
};

export { toolCall as createReminderToolCall };
