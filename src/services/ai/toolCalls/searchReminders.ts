import { LREMINDER_TYPE } from "little-shared/enums";
import { LDate } from "little-shared/types";
import type { Reminder } from "../../../storage/repositories";
import { IDJSONObjectInstruction } from "../config";
import type { LittleAI } from "../main";
import { reminderKind, searchReminders } from "../../../popup/records";
import { readReminders } from "../records";
import { hybridRank, rrfFuse } from "./_utils/bm25";
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
import type { AIOwner } from "../owner";

const reminderSearchText = (reminder: Reminder): string =>
	[reminder.message, ...(reminder.tags ?? [])].join(" ");

const toolCall = async (
	owner: AIOwner,
	ai: Pick<LittleAI, "getStructuredResponse">,
	{
		query,
		type,
		targetDate,
		targetDateCriteria,
		tag,
	}: {
		query?: string;
		type?: LREMINDER_TYPE;
		targetDate?: LDate;
		targetDateCriteria?: LDateMatchCriteria;
		tag?: string;
	},
): Promise<Array<Reminder>> => {
	const reminders = await readReminders(await owner.keys());
	if (!query && !type && !targetDate && !tag) {
		return reminders;
	}
	let resultReminders = reminders.slice();
	if (tag && tag.trim() !== "") {
		const normalizedTag = tag.trim().toLowerCase().replace(/^#/, "");
		resultReminders = resultReminders.filter((reminder) =>
			(reminder.tags ?? []).some(
				(t) => t.toLowerCase() === normalizedTag,
			),
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
	if (query && resultReminders.length > 0) {
		const lexicalHits = searchReminders(resultReminders, query);
		const bm25Hits = hybridRank(
			resultReminders,
			query,
			reminderSearchText,
		).map((entry) => entry.item);
		const mergedLexical = pickSemanticCandidates(
			bm25Hits,
			lexicalHits,
			resultReminders.length,
		);
		const remindersToSend = pickSemanticCandidates(
			mergedLexical,
			resultReminders,
		).map((reminder) => ({
			id: reminder.id,
			message: reminder.message,
			type: reminderKind(reminder),
			targetDate: toModelDate(reminder.target),
			tags: reminder.tags ?? [],
		}));
		const response = await ai.getStructuredResponse(
			`
                Here is a list of reminders in JSON format:
                ${JSON.stringify(remindersToSend)}

                The user's query is: "${quoteForPrompt(query)}".

                Find all relevant ids of reminders where the message or tags match or relate to the query.
            `,
			IDJSONObjectInstruction,
		);
		const semanticReminderIds = extractSemanticIds(response);
		const fusedIds = rrfFuse([
			bm25Hits.map((reminder) => reminder.id),
			lexicalHits.map((reminder) => reminder.id),
			semanticReminderIds,
		]);
		const byId = new Map(
			resultReminders.map((reminder) => [reminder.id, reminder]),
		);
		resultReminders = fusedIds
			.map((id) => byId.get(id))
			.filter((reminder): reminder is Reminder => reminder !== undefined);
	}
	return resultReminders;
};

export { toolCall as searchRemindersToolCall };
