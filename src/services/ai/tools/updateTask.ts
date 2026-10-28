import { LDATE_FORMAT } from "little-shared/constants";
import { LTASK_PRIORITY } from "little-shared/enums";
import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "update_task",
		description: "Updates an existing task by id",
		parameters: {
			type: "object",
			properties: {
				id: {
					type: "string",
					description: "The id of the task to update",
				},
				information: {
					type: "string",
					description: "Updated task details",
				},
				label: {
					type: "string",
					description: "Updated short label",
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
					description: `Updated due date (${LDATE_FORMAT})`,
				},
			},
			required: ["id"],
			additionalProperties: false,
		},
		strict: true,
	},
};

export { tool as updateTaskTool };
