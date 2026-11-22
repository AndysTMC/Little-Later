import type OpenAI from "openai";

export const searchAllTool: OpenAI.Chat.Completions.ChatCompletionFunctionTool =
	{
		type: "function",
		function: {
			name: "search_all",
			description:
				"Search across all unlocked Little Later records (notes, tasks, reminders, saves, and images) in one call using local hybrid ranking. Locked notes are never searched.",
			parameters: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description:
							"Search query text (keywords, topic, title, or phrase).",
					},
					tag: {
						type: "string",
						description:
							"Optional tag filter (with or without leading #).",
					},
					limit: {
						type: "integer",
						description:
							"Maximum results to return per category (default 5, max 15).",
					},
				},
				required: [],
			},
		},
	};
