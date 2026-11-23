import { LTASK_PRIORITY } from "little-shared/enums";
import { LDate } from "little-shared/types";
import type { Task } from "../../../storage/repositories";
import { normalizeTag } from "../../../utils/tags";
import type { TaskSchedule } from "../../../storage/schema";
import { IDJSONObjectInstruction } from "../config";
import type { LittleAI } from "../main";
import { searchTasks } from "../../../popup/records";
import { readTasks } from "../records";
import { hybridRank, rrfFuse } from "./_utils/bm25";
import { extractSemanticIds } from "./_utils/extractSemanticIds";
import {
	pickSemanticCandidates,
	quoteForPrompt,
} from "./_utils/semanticSearch";
import { dateMatchesCriteria, LDateMatchCriteria } from "./_utils/dateFilters";
import type { AIOwner } from "../owner";

const taskSearchText = (task: Task): string =>
	[task.label, task.information, task.priority, ...(task.tags ?? [])].join(
		" ",
	);

const toolCall = async (
	owner: AIOwner,
	ai: Pick<LittleAI, "getStructuredResponse">,
	{
		deadlineDate,
		deadlineDateCriteria,
		finishDate,
		finishDateCriteria,
		priority,
		query,
		scheduleType,
		tag,
	}: {
		deadlineDate?: LDate;
		deadlineDateCriteria?: LDateMatchCriteria;
		finishDate?: LDate;
		finishDateCriteria?: LDateMatchCriteria;
		priority?: LTASK_PRIORITY;
		query?: string;
		scheduleType?: TaskSchedule["kind"];
		tag?: string;
	},
): Promise<Array<Task>> => {
	const tasks = await readTasks(await owner.keys());
	let resultTasks = tasks.slice();
	if (tag && tag.trim() !== "") {
		const normalizedTag = normalizeTag(tag);
		if (normalizedTag) {
			resultTasks = resultTasks.filter((task) =>
				(task.tags ?? []).some(
					(t) => t.toLowerCase() === normalizedTag,
				),
			);
		}
	}
	if (priority) {
		resultTasks = resultTasks.filter(
			(task) => task.priority === (priority as string),
		);
	}
	if (scheduleType) {
		resultTasks = resultTasks.filter(
			(task) => task.schedule.kind === scheduleType,
		);
	}
	// A recurring task's deadline is its next occurrence.
	if (deadlineDate) {
		resultTasks = resultTasks.filter(
			(task) =>
				task.dueAt !== 0 &&
				dateMatchesCriteria(
					task.dueAt,
					deadlineDate,
					deadlineDateCriteria,
				),
		);
	}
	if (finishDate !== undefined) {
		resultTasks = resultTasks.filter(
			(task) =>
				task.finishedAt !== 0 &&
				dateMatchesCriteria(
					task.finishedAt,
					finishDate,
					finishDateCriteria,
				),
		);
	}
	const trimmedQuery = query?.trim() ?? "";
	if (trimmedQuery && resultTasks.length > 0) {
		const lexicalHits = searchTasks(resultTasks, trimmedQuery);
		const bm25Hits = hybridRank(
			resultTasks,
			trimmedQuery,
			taskSearchText,
		).map((entry) => entry.item);
		const mergedLexical = pickSemanticCandidates(
			bm25Hits,
			lexicalHits,
			resultTasks.length,
		);
		const tasksToSend = pickSemanticCandidates(
			mergedLexical,
			resultTasks,
		).map((task) => ({
			id: task.id,
			label: task.label,
			information: task.information,
			priority: task.priority,
			tags: task.tags ?? [],
		}));
		let semanticTaskIds: Array<string> = [];
		try {
			const response = await ai.getStructuredResponse(
				`
                Here is a list of tasks in JSON format:
                ${JSON.stringify(tasksToSend)}

                The user's query is: "${quoteForPrompt(trimmedQuery)}".

                Find all relevant ids of tasks where the information, label, or tags match or relate to the query.
            `,
				IDJSONObjectInstruction,
			);
			semanticTaskIds = extractSemanticIds(response);
		} catch {
			// Fall back to local BM25 + lexical hits if semantic re-ranking fails.
		}
		const fusedIds = rrfFuse([
			bm25Hits.map((task) => task.id),
			lexicalHits.map((task) => task.id),
			semanticTaskIds,
		]);
		const byId = new Map(resultTasks.map((task) => [task.id, task]));
		resultTasks = fusedIds
			.map((id) => byId.get(id))
			.filter((task): task is Task => task !== undefined);
	}
	return resultTasks;
};

export { toolCall as searchTasksToolCall };
