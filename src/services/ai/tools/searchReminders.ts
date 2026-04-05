import { LDATE_FORMAT } from "little-shared/constants";
import { LREMINDER_TYPE } from "little-shared/enums";
import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "search_reminders",
		description:
			"Search reminders by message, type, and targetDate. If you need a concrete date string, call format_date_time first and pass date criteria for partial date matching.",
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description:
						"The user's query with all necessary information to search the reminders",
				},
				targetDate: {
					type: "string",
					description: `The target date of the reminder (format: ${LDATE_FORMAT})`,
				},
				targetDateCriteria: {
					type: "object",
					description:
						"Optional date-part criteria for targetDate matching. Enable fields you want compared.",
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
				type: {
					type: "string",
					description: "The type of the reminder",
					enum: [LREMINDER_TYPE.NORMAL, LREMINDER_TYPE.ESCALATING],
				},
			},
			required: [],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as searchRemindersTool };
