import { LDATE_FORMAT } from "little-shared/constants";
import { LTASK_PRIORITY } from "little-shared/enums";
import type OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionFunctionTool = {
	type: "function",
	function: {
		name: "create_task",
		description:
			"Creates a task. Supports anytime (default), due (deadlineDate), or recurring (recurrence rule) schedules, plus optional tags.",
		parameters: {
			type: "object",
			properties: {
				information: {
					type: "string",
					description: "The task details",
				},
				label: {
					type: "string",
					description: "A short label for the task",
				},
				priority: {
					type: "string",
					enum: [
						LTASK_PRIORITY.LOW,
						LTASK_PRIORITY.MEDIUM,
						LTASK_PRIORITY.HIGH,
					],
				},
				deadlineDate: {
					type: "string",
					description: `Optional due date (${LDATE_FORMAT})`,
				},
				recurrence: {
					type: "object",
					description:
						"Optional recurring schedule rule (mutually exclusive with deadlineDate).",
					properties: {
						freq: {
							type: "string",
							enum: ["daily", "weekly", "monthly", "yearly"],
						},
						interval: {
							type: "integer",
							description: "Repeat every N units (default 1).",
						},
						time: {
							type: "string",
							description:
								'Local 24-hour time "HH:mm" (default "09:00").',
						},
						byWeekday: {
							type: "array",
							items: { type: "integer" },
							description:
								"ISO weekdays 1 (Mon) to 7 (Sun) for weekly rules.",
						},
						byMonthDay: {
							type: "integer",
							description:
								"Day of month 1..31 (or -1 for last day) for monthly/yearly rules.",
						},
						byMonth: {
							type: "integer",
							description: "Month 1..12 for yearly rules.",
						},
					},
					required: ["freq"],
					additionalProperties: false,
				},
				tags: {
					type: "array",
					items: { type: "string" },
					description: "Optional tags for the task.",
				},
			},
			required: ["information"],
			additionalProperties: false,
		},
	},
};

export { tool as createTaskTool };
