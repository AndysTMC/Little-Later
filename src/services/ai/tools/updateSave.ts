import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "update_save",
		description: "Updates a saved visual bookmark's custom name",
		parameters: {
			type: "object",
			properties: {
				id: {
					type: "string",
					description: "The id of the save to update",
				},
				customName: {
					type: "string",
					description: "The new custom name for the save",
				},
			},
			required: ["id", "customName"],
			additionalProperties: false,
		},
		strict: true,
	},
};

export { tool as updateSaveTool };
