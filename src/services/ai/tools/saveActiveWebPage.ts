import type OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionFunctionTool = {
	type: "function",
	function: {
		name: "save_active_web_page",
		description:
			"Saves the currently active browser tab as a visual bookmark",
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: false,
		},
	},
};

export { tool as saveActiveWebPageTool };
