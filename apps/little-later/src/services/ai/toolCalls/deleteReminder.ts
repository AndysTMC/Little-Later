import { deleteReminder } from "../../../services/reminder";

const toolCall = async ({
	id,
}: {
	id: number;
}): Promise<() => Promise<void>> => {
	return async () => {
		await deleteReminder(id);
	};
};

export { toolCall as deleteReminderToolCall };
