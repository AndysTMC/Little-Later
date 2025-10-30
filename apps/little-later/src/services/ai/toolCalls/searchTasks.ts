import { LTASK_PRIORITY, LTASK_SCHEDULE_TYPE } from "little-shared/enums";
import { LDate, LRecurringInfo, LTask } from "little-shared/types";
import { IDJSONSchema, IDJSONObjectInstruction } from "../config";
import { LittleAI } from "../../../services/ai";
import { getDBTables } from "../../../utils/db";
import { searchTasksByText } from "little-shared/utils/task";

const toolCall = async (
	ai: LittleAI,
	{
		deadlineDate,
		finishDate,
		priority,
		query,
		recurringInfo,
		scheduleType,
	}: {
		deadlineDate?: LDate;
		finishDate?: LDate;
		priority?: LTASK_PRIORITY;
		query?: string;
		recurringInfo?: LRecurringInfo;
		scheduleType?: LTASK_SCHEDULE_TYPE;
	},
): Promise<LTask[]> => {
	const { taskTbl } = await getDBTables(["taskTbl"]);
	if (taskTbl === undefined) {
		throw new Error("Something went wrong while fetching tasks.");
	}
	let resultTasks = taskTbl.slice();
	if (query) {
		const queryTasks: Array<LTask> = [];
		const filteredTasks = searchTasksByText(taskTbl, query);
		filteredTasks.forEach((task) => {
			if (!queryTasks.includes(task)) {
				queryTasks.push(task);
			}
		});
		const response = await ai.getStructuredResponse(
			`
                Here is a list of tasks in JSON format:
                ${JSON.stringify(taskTbl, null, 2)}

                The user's query is: "${query}".

                Find all relevant ids of tasks where the information matches or relates to the query.
            `,
			IDJSONSchema,
			IDJSONObjectInstruction,
		);
		const symanticTaskIds = (response as { ids: number[] }).ids;
		const symanticTasks = taskTbl.filter((task) =>
			symanticTaskIds.includes(task.id),
		);
		symanticTasks.forEach((task) => {
			if (!queryTasks.includes(task)) {
				queryTasks.push(task);
			}
		});
		resultTasks = resultTasks.filter((task) => queryTasks.includes(task));
	}
	if (priority) {
		const priorityFilteredTasks = resultTasks.filter(
			(task) => task.priority === priority,
		);
		resultTasks = resultTasks.filter((task) =>
			priorityFilteredTasks.includes(task),
		);
	}
	if (scheduleType) {
		const typeFilteredTasks = resultTasks.filter(
			(task) => task.schedule.type === scheduleType,
		);
		resultTasks = resultTasks.filter((task) =>
			typeFilteredTasks.includes(task),
		);
	}
	if (recurringInfo) {
		const recurringInfoFilteredTasks = resultTasks.filter(
			(task) =>
				task.schedule.type === LTASK_SCHEDULE_TYPE.RECURRING &&
				task.schedule.recurringInfo === recurringInfo,
		);
		resultTasks = resultTasks.filter((task) =>
			recurringInfoFilteredTasks.includes(task),
		);
	}
	if (deadlineDate) {
		const deadlineTSFilteredTasks = resultTasks.filter(
			(task) =>
				task.schedule.type === LTASK_SCHEDULE_TYPE.DUE &&
				task.schedule.deadlineInfo.deadlineDate === deadlineDate,
		);
		resultTasks = resultTasks.filter((task) =>
			deadlineTSFilteredTasks.includes(task),
		);
	}
	if (finishDate !== undefined) {
		const isFinishedFilteredTasks = resultTasks.filter(
			(task) => task.finishDate === finishDate,
		);
		resultTasks = resultTasks.filter((task) =>
			isFinishedFilteredTasks.includes(task),
		);
	}
	return resultTasks;
};

export { toolCall as searchTasksToolCall };
