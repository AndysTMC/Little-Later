import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "save_active_web_page",
		description:
			"Converts the active webpage to a save or (bookmarks or saves the active webpage).",
		parameters: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
		strict: true,
	},
};

export { tool as saveActiveWebPageTool };
