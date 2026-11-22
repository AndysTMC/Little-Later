import type OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionFunctionTool = {
	type: "function",
	function: {
		name: "get_user_app_theme_pref",
		description: "Fetches user's app theme preference from the database",
		parameters: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
};
export { tool as getUserAppThemePrefTool };
