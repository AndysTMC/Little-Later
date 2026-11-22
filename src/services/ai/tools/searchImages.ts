import type OpenAI from "openai";

export const searchImagesTool: OpenAI.Chat.Completions.ChatCompletionFunctionTool =
	{
		type: "function",
		function: {
			name: "search_images",
			description:
				"Search saved images in Little Later by title, source URL, or tag.",
			parameters: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description:
							"Search text matching image title, source URL, or tags. Leave empty to list recent images.",
					},
					tag: {
						type: "string",
						description:
							"Optional tag filter (with or without leading #).",
					},
				},
				required: [],
			},
		},
	};
