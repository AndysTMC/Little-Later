import type OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionFunctionTool = {
	type: "function",
	function: {
		name: "get_user_name",
		description: "Fetches user's name from the database",
		parameters: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
};

export { tool as getUserNameTool };
