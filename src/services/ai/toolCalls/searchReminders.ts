import { LREMINDER_TYPE } from "little-shared/enums";
import { LDate, LReminder } from "little-shared/types";
import { IDJSONSchema, IDJSONObjectInstruction } from "../config";
import { LittleAI } from "../../../services/ai";
import { getDBTables } from "../../../utils/db";
import { searchRemindersByText } from "little-shared/utils/reminder";
import { extractSemanticIds } from "./_utils/extractSemanticIds";
import {
	dateMatchesCriteria,
	LDateMatchCriteria,
} from "./_utils/dateFilters";

const toolCall = async (
	ai: LittleAI,
	{
		query,
		type,
		targetDate,
		targetDateCriteria,
	}: {
		query?: string;
		type?: LREMINDER_TYPE;
		targetDate?: LDate;
		targetDateCriteria?: LDateMatchCriteria;
	},
) => {
	const { reminderTbl } = await getDBTables(["reminderTbl"]);

	if (reminderTbl === undefined) {
		throw new Error("Something went wrong while fetching reminders.");
	}

	if (!query && !type && !targetDate) {
		return reminderTbl;
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
		const semanticReminderIds = extractSemanticIds(response);
		const semanticReminders = reminderTbl.filter((reminder) =>
			semanticReminderIds.includes(reminder.id),
		);
		semanticReminders.forEach((reminder) => {
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
		const targetTSFilteredReminders = resultReminders.filter((reminder) =>
			dateMatchesCriteria(
				reminder.targetDate,
				targetDate,
				targetDateCriteria,
			),
		);
		resultReminders = resultReminders.filter((reminder) =>
			targetTSFilteredReminders.includes(reminder),
		);
	}
	return resultReminders;
};

export { toolCall as searchRemindersToolCall };
