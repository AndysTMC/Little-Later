import type OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionFunctionTool = {
	type: "function",
	function: {
		name: "search_notes",
		description: "Function to search notes by content",
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description:
						"The user's query with all necessary information to search the notes",
				},
				tag: {
					type: "string",
					description: "Optional tag filter (with or without #)",
				},
			},
			required: ["query"],
			additionalProperties: false,
		},
	},
};
export { tool as searchNotesTool };
