import { LDATE_FORMAT } from "little-shared/constants";
import { LTASK_PRIORITY } from "little-shared/enums";
import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "search_tasks",
		description:
			"Search tasks by information, label, priority, schedule type, deadlineDate and finishDate. If you need a concrete date string, call format_date_time first and pass date criteria for partial date matching.",
		parameters: {
			type: "object",
			properties: {
				finishDate: {
					type: "string",
					description: `The finish date of the task, if it is finished else null (format: ${LDATE_FORMAT})`,
				},
				priority: {
					type: "string",
					description: "The priority of the task",
					enum: [
						LTASK_PRIORITY.LOW,
						LTASK_PRIORITY.MEDIUM,
						LTASK_PRIORITY.HIGH,
					],
				},
				query: {
					type: "string",
					description:
						"The user's query with all necessary information to search the tasks",
				},
				deadlineDate: {
					type: "string",
					description:
						"The deadline date of the task; for a recurring task, its next occurrence",
				},
				deadlineDateCriteria: {
					type: "object",
					description:
						"Optional date-part criteria for deadlineDate matching. Enable fields you want compared.",
					properties: {
						year: { type: "boolean" },
						month: { type: "boolean" },
						day: { type: "boolean" },
						hour: { type: "boolean" },
						minute: { type: "boolean" },
						second: { type: "boolean" },
					},
					additionalProperties: false,
				},
				finishDateCriteria: {
					type: "object",
					description:
						"Optional date-part criteria for finishDate matching. Enable fields you want compared.",
					properties: {
						year: { type: "boolean" },
						month: { type: "boolean" },
						day: { type: "boolean" },
						hour: { type: "boolean" },
						minute: { type: "boolean" },
						second: { type: "boolean" },
					},
					additionalProperties: false,
				},
				scheduleType: {
					type: "string",
					description:
						"The type of the task schedule: anytime (no deadline), due (one deadline) or recurring",
					enum: ["anytime", "due", "recurring"],
				},
			},
			required: [],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as searchTasksTool };
