import { LTASK_PRIORITY } from "little-shared/enums";
import { LDate } from "little-shared/types";
import type { Task } from "../../../storage/repositories";
import type { TaskSchedule } from "../../../storage/schema";
import { IDJSONSchema, IDJSONObjectInstruction } from "../config";
import { LittleAI } from "../../../services/ai";
import { searchTasks } from "../../../popup/records";
import { readTasks, unlockedKeys } from "../records";
import { extractSemanticIds } from "./_utils/extractSemanticIds";
import {
	pickSemanticCandidates,
	quoteForPrompt,
} from "./_utils/semanticSearch";
import { dateMatchesCriteria, LDateMatchCriteria } from "./_utils/dateFilters";

const toolCall = async (
	ai: Pick<LittleAI, "getStructuredResponse">,
	{
		deadlineDate,
		deadlineDateCriteria,
		finishDate,
		finishDateCriteria,
		priority,
		query,
		scheduleType,
	}: {
		deadlineDate?: LDate;
		deadlineDateCriteria?: LDateMatchCriteria;
		finishDate?: LDate;
		finishDateCriteria?: LDateMatchCriteria;
		priority?: LTASK_PRIORITY;
		query?: string;
		scheduleType?: TaskSchedule["kind"];
	},
): Promise<Array<Task>> => {
	const tasks = await readTasks(await unlockedKeys());
	let resultTasks = tasks.slice();
	if (query) {
		const queryTasks = new Set<Task>(searchTasks(tasks, query));
		const tasksToSend = pickSemanticCandidates([...queryTasks], tasks).map(
			(task) => ({
				id: task.id,
				label: task.label,
				information: task.information,
				priority: task.priority,
			}),
		);
		const response = await ai.getStructuredResponse(
			`
                Here is a list of tasks in JSON format:
                ${JSON.stringify(tasksToSend)}

                The user's query is: "${quoteForPrompt(query)}".

                Find all relevant ids of tasks where the information matches or relates to the query.
            `,
			IDJSONSchema,
			IDJSONObjectInstruction,
		);
		const semanticTaskIds = extractSemanticIds(response);
		tasks
			.filter((task) => semanticTaskIds.includes(task.id))
			.forEach((task) => queryTasks.add(task));
		resultTasks = resultTasks.filter((task) => queryTasks.has(task));
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
	return resultTasks;
};

export { toolCall as searchTasksToolCall };
