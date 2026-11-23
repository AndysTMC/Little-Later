import { LREMINDER_TYPE } from "little-shared/enums";
import { LDate } from "little-shared/types";
import type { Reminder } from "../../../storage/repositories";
import { normalizeTag } from "../../../utils/tags";
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
		const normalizedTag = normalizeTag(tag);
		if (normalizedTag) {
			resultReminders = resultReminders.filter((reminder) =>
				(reminder.tags ?? []).some(
					(t) => t.toLowerCase() === normalizedTag,
				),
			);
		}
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
	const trimmedQuery = query?.trim() ?? "";
	if (trimmedQuery && resultReminders.length > 0) {
		const lexicalHits = searchReminders(resultReminders, trimmedQuery);
		const bm25Hits = hybridRank(
			resultReminders,
			trimmedQuery,
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
		let semanticReminderIds: Array<string> = [];
		try {
			const response = await ai.getStructuredResponse(
				`
                Here is a list of reminders in JSON format:
                ${JSON.stringify(remindersToSend)}

                The user's query is: "${quoteForPrompt(trimmedQuery)}".

                Find all relevant ids of reminders where the message or tags match or relate to the query.
            `,
				IDJSONObjectInstruction,
			);
			semanticReminderIds = extractSemanticIds(response);
		} catch {
			// Fall back to local BM25 + lexical hits if semantic re-ranking fails.
		}
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
