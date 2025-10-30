import { LDATE_FORMAT } from "little-shared/constants";
import { LREMINDER_TYPE } from "little-shared/enums";
import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "search_reminders",
		description:
			"Function to search reminders by message, type, and targetTS",
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
				type: {
					type: "string",
					description: "The type of the reminder",
					enum: [LREMINDER_TYPE.NORMAL, LREMINDER_TYPE.ESCALATING],
				},
			},
			required: ["query", "targetDate", "type"],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as searchRemindersTool };
