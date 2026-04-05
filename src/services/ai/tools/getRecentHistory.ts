import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "get_recent_history",
		description:
			"Fetches recent browsing history items from visual bookmarks (browsed pages)",
		parameters: {
			type: "object",
			properties: {
				limit: {
					type: "number",
					description:
						"Maximum number of history items to return (optional, defaults to 10)",
				},
			},
			required: [],
			additionalProperties: false,
		},
		strict: true,
	},
};

export { tool as getRecentHistoryTool };
