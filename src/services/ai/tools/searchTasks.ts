import { LDATE_FORMAT } from "little-shared/constants";
import {
	LTASK_PRIORITY,
	LRECURRING_TYPE,
	LTASK_SCHEDULE_TYPE,
} from "little-shared/enums";
import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "search_tasks",
		description:
			"Search tasks by information, label, priority, type, recurringInfo, and deadlineDate. If you need a concrete date string, call format_date_time first and pass date criteria for partial date matching.",
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
					description: "The deadline date of the task",
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
				recurringInfo: {
					anyOf: [
						{
							type: "object",
							properties: {
								time: {
									type: "string",
									description:
										"The time of the recurring task",
								},
								type: {
									const: LRECURRING_TYPE.DAILY,
								},
							},
							required: ["time", "type"],
							additionalProperties: false,
						},
						{
							type: "object",
							properties: {
								time: {
									type: "string",
									description:
										"The time of the recurring task",
								},
								type: {
									const: LRECURRING_TYPE.WEEKLY,
								},
								weekDay: {
									type: "number",
									description:
										"The week day of the recurring task (0-6) (0 = Sunday, 6 = Saturday)",
								},
							},
							required: ["time", "type", "weekDay"],
							additionalProperties: false,
						},
						{
							type: "object",
							properties: {
								day: {
									type: "number",
									description:
										"The day of the recurring task (1-28)",
								},
								time: {
									type: "string",
									description:
										"The time of the recurring task",
								},
								type: {
									const: LRECURRING_TYPE.MONTHLY,
								},
							},
							required: ["day", "time", "type"],
							additionalProperties: false,
						},
						{
							type: "object",
							properties: {
								day: {
									type: "number",
									description:
										"The day of the recurring task (1-28)",
								},
								month: {
									type: "number",
									description:
										"The month of the recurring task (0-11)",
								},
								time: {
									type: "string",
									description:
										"The time of the recurring task",
								},
								type: {
									const: LRECURRING_TYPE.YEARLY,
								},
							},
							required: ["day", "month", "time", "type"],
							additionalProperties: false,
						},
					],
				},
				scheduleType: {
					type: "string",
					description: "The type of the task schedule",
					enum: [
						LTASK_SCHEDULE_TYPE.DUE,
						LTASK_SCHEDULE_TYPE.RECURRING,
						LTASK_SCHEDULE_TYPE.ADHOC,
					],
				},
			},
			required: [],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as searchTasksTool };
