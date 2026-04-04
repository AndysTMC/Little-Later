import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "update_save",
		description: "Updates the save with the given information",
		parameters: {
			type: "object",
			properties: {
				id: {
					type: "number",
					description: "The id of the save to be updated",
				},
				customName: {
					type: "string",
					description: "The updated name of the save",
				},
			},
			required: ["id", "customName"],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as updateSaveTool };
