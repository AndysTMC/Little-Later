import { LREMINDER_TYPE } from "little-shared/enums";
import { LDate } from "little-shared/types";
import type { Reminder } from "../../../storage/repositories";
import { IDJSONSchema, IDJSONObjectInstruction } from "../config";
import { LittleAI } from "../../../services/ai";
import { reminderKind, searchReminders } from "../../../popup/records";
import { readReminders, unlockedKeys } from "../records";
import { extractSemanticIds } from "./_utils/extractSemanticIds";
import {
	pickSemanticCandidates,
	quoteForPrompt,
} from "./_utils/semanticSearch";
import {
	dateMatchesCriteria,
	toModelDate,
	LDateMatchCriteria,
} from "./_utils/dateFilters";

const toolCall = async (
	ai: Pick<LittleAI, "getStructuredResponse">,
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
): Promise<Array<Reminder>> => {
	const reminders = await readReminders(await unlockedKeys());
	if (!query && !type && !targetDate) {
		return reminders;
	}
	let resultReminders = reminders.slice();
	if (query) {
		const queryReminders = new Set<Reminder>(
			searchReminders(reminders, query),
		);
		const remindersToSend = pickSemanticCandidates(
			[...queryReminders],
			reminders,
		).map((reminder) => ({
			id: reminder.id,
			message: reminder.message,
			type: reminderKind(reminder),
			targetDate: toModelDate(reminder.target),
		}));
		const response = await ai.getStructuredResponse(
			`
                Here is a list of reminders in JSON format:
                ${JSON.stringify(remindersToSend)}

                The user's query is: "${quoteForPrompt(query)}".

                Find all relevant ids of reminders where the message matches or relates to the query.
            `,
			IDJSONSchema,
			IDJSONObjectInstruction,
		);
		const semanticReminderIds = extractSemanticIds(response);
		reminders
			.filter((reminder) => semanticReminderIds.includes(reminder.id))
			.forEach((reminder) => queryReminders.add(reminder));
		resultReminders = resultReminders.filter((reminder) =>
			queryReminders.has(reminder),
		);
	}
	if (type) {
		resultReminders = resultReminders.filter(
			(reminder) => reminderKind(reminder) === type,
		);
	}
	if (targetDate) {
		resultReminders = resultReminders.filter((reminder) =>
			dateMatchesCriteria(
				reminder.target,
				targetDate,
				targetDateCriteria,
			),
		);
	}
	return resultReminders;
};

export { toolCall as searchRemindersToolCall };
