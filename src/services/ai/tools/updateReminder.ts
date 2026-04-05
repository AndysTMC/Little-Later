import { LDATE_FORMAT } from "little-shared/constants";
import { LREMINDER_TYPE } from "little-shared/enums";
import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "update_reminder",
		description: "Updates the reminder with the given information",
		parameters: {
			type: "object",
			properties: {
				id: {
					type: "number",
					description: "The id of the reminder to be updated",
				},
				message: {
					type: "string",
					description:
						"The updated reminder text only. Do not include date, time, or scheduling words in this field.",
				},
				targetDate: {
					type: "string",
					description: `The target date of the reminder (format: ${LDATE_FORMAT})`,
				},
				type: {
					type: "string",
					enum: [LREMINDER_TYPE.NORMAL, LREMINDER_TYPE.ESCALATING],
					description:
						"The updated type of reminder (default is normal if not specified)",
				},
			},
			required: ["id"],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as updateReminderTool };
