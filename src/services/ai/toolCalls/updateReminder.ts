import { LREMINDER_TYPE } from "little-shared/enums";
import { getReminder, updateReminder } from "../../../services/reminder";
import { LDate } from "little-shared/types";

const toolCall = async (
	id: number,
	{
		message,
		type,
		targetDate,
	}: {
		message?: string;
		type?: LREMINDER_TYPE;
		targetDate?: LDate;
	},
): Promise<() => Promise<void>> => {
	const reminder = await getReminder(id);
	if (reminder === undefined) {
		throw new Error("Reminder not found.");
	}
	const modifiedReminder = {
		...reminder,
		message: message ?? reminder.message,
		type: type ?? reminder.type,
		targetTS: targetDate ?? reminder.targetDate,
	};
	return async () => {
		await updateReminder(reminder.id, modifiedReminder);
	};
};

export { toolCall as updateReminderToolCall };
