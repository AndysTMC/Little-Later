import { LREMINDER_TYPE } from "little-shared/enums";
import { LDate } from "little-shared/types";
import { send } from "../../../utils/send";
import { readReminders, unlockedKeys } from "../records";
import { fromModelDate } from "./_utils/dateFilters";

// Only what changes goes out: a new time or type restarts the schedule.
const toolCall = async (
	id: string,
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
	const reminder = (await readReminders(await unlockedKeys())).find(
		(item) => item.id === id,
	);
	if (reminder === undefined) {
		throw new Error("Reminder not found.");
	}
	const target =
		targetDate === undefined ? undefined : fromModelDate(targetDate);
	const escalate =
		type === undefined ? undefined : type === LREMINDER_TYPE.ESCALATING;
	return async () => {
		await send("reminder.update", {
			id,
			message,
			target: target !== reminder.target ? target : undefined,
			escalate:
				escalate !== (reminder.escalation !== null)
					? escalate
					: undefined,
		});
	};
};

export { toolCall as updateReminderToolCall };
