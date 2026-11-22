import type OpenAI from "openai";

export const readOpenTabsTool: OpenAI.Chat.Completions.ChatCompletionFunctionTool =
	{
		type: "function",
		function: {
			name: "read_open_tabs",
			description:
				"List the titles and URLs of open web tabs in the user's current browser window (http/https only).",
			parameters: {
				type: "object",
				properties: {
					limit: {
						type: "integer",
						description:
							"Maximum number of tabs to return (default 25, max 50).",
					},
				},
				required: [],
			},
		},
	};
