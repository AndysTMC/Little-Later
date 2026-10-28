import { send } from "../../../utils/send";

const toolCall = async ({
	id,
}: {
	id: string;
}): Promise<() => Promise<void>> => {
	return async () => {
		await send("reminder.delete", { id });
	};
};

export { toolCall as deleteReminderToolCall };
