import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
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
			},
			required: ["query"],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as searchNotesTool };
