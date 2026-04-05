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
					description:
						"The reminder text only. Do not include date, time, or scheduling words in this field.",
				},
				targetDate: {
					type: "string",
					description: `The target date of the reminder (format: ${LDATE_FORMAT})`,
				},
				type: {
					type: "string",
					description:
						"The type of reminder (optional, defaults to normal when omitted)",
					enum: [LREMINDER_TYPE.NORMAL, LREMINDER_TYPE.ESCALATING],
				},
			},
			required: ["message", "targetDate"],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as createReminderTool };
