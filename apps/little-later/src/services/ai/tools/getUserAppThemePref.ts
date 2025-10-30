import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "get_user_app_theme_pref",
		description: "Fetches user's app theme preference from the database",
		parameters: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as getUserAppThemePrefTool };
