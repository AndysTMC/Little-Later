import { LDATE_FORMAT } from "little-shared/constants";
import { LTASK_PRIORITY } from "little-shared/enums";
import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "create_task",
		description:
			"Creates a task. It has no deadline (anytime) if no deadlineDate is provided; with one, it is due then and gets a reminder.",
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
			},
			required: ["information"],
			additionalProperties: false,
		},
		strict: true,
	},
};

export { tool as createTaskTool };
