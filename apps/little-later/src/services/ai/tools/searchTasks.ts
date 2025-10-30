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
			"Function to search tasks by information, label, priority, type, recurringInfo, and deadlineTS",
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
			required: [
				"query",
				"scheduleType",
				"priority",
				"finishDate",
				"deadlineDate",
				"recurringInfo",
			],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as searchTasksTool };
