import { LDATE_FORMAT } from "little-shared/constants";
import { LREMINDER_TYPE } from "little-shared/enums";
import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "create_reminder",
		description: "Creates a reminder with the given information",
		parameters: {
			type: "object",
			properties: {
				message: {
					type: "string",
					description: "The message of the reminder",
				},
				targetDate: {
					type: "string",
					description: `The target date of the reminder (format: ${LDATE_FORMAT})`,
				},
				type: {
					type: "string",
					description:
						"The type of reminder (default is normal if not specified)",
					enum: [LREMINDER_TYPE.NORMAL, LREMINDER_TYPE.ESCALATING],
				},
			},
			required: ["message", "targetDate", "type"],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as createReminderTool };
