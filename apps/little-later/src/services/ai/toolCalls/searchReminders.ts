import { LREMINDER_TYPE } from "little-shared/enums";
import { LDate, LReminder } from "little-shared/types";
import { IDJSONSchema, IDJSONObjectInstruction } from "../config";
import { LittleAI } from "../../../services/ai";
import { getDBTables } from "../../../utils/db";
import { searchRemindersByText } from "../../../../../../packages/shared/src/utils/reminder";

const toolCall = async (
	ai: LittleAI,
	{
		query,
		type,
		targetDate,
	}: {
		query?: string;
		type?: LREMINDER_TYPE;
		targetDate?: LDate;
	},
) => {
	const { reminderTbl } = await getDBTables(["reminderTbl"]);

	if (reminderTbl === undefined) {
		throw new Error("Something went wrong while fetching reminders.");
	}

	if (!query && !type && !targetDate) {
		throw new Error(
			"At least one of the query, type, or target timestamp must be provided.",
		);
	}

	let resultReminders: LReminder[] = reminderTbl.slice();
	if (query) {
		const queryReminders: LReminder[] = [];
		const filteredReminders = searchRemindersByText(reminderTbl, query);
		filteredReminders.forEach((reminder) => {
			if (!queryReminders.includes(reminder)) {
				queryReminders.push(reminder);
			}
		});
		const response = await ai.getStructuredResponse(
			`
                Here is a list of reminders in JSON format:
                ${JSON.stringify(reminderTbl, null, 2)}

                The user's query is: "${query}".

                Find all relevant ids of reminders where the message matches or relates to the query.
            `,
			IDJSONSchema,
			IDJSONObjectInstruction,
		);
		const symanticReminderIds = (response as { ids: number[] }).ids;
		const symanticReminders = reminderTbl.filter((reminder) =>
			symanticReminderIds.includes(reminder.id),
		);
		symanticReminders.forEach((reminder) => {
			if (!queryReminders.includes(reminder)) {
				queryReminders.push(reminder);
			}
		});
		resultReminders = resultReminders.filter((reminder) =>
			queryReminders.includes(reminder),
		);
	}
	if (type) {
		const typeFilteredReminders = resultReminders.filter(
			(reminder) => reminder.type === type,
		);
		resultReminders = resultReminders.filter((reminder) =>
			typeFilteredReminders.includes(reminder),
		);
	}
	if (targetDate) {
		const targetTSFilteredReminders = resultReminders.filter(
			(reminder) => reminder.targetDate === targetDate,
		);
		resultReminders = resultReminders.filter((reminder) =>
			targetTSFilteredReminders.includes(reminder),
		);
	}
	return resultReminders;
};

export { toolCall as searchRemindersToolCall };
