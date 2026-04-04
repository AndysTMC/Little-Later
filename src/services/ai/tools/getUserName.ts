import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "get_user_name",
		description: "Fetches user's name from the database",
		parameters: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
		strict: true,
	},
};

export { tool as getUserNameTool };
