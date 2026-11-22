import type OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionFunctionTool = {
	type: "function",
	function: {
		name: "delete_save",
		description:
			"Unsaves the page with the given id: it stays in browsing history, and its notes, tasks and reminders are detached from it",
		parameters: {
			type: "object",
			properties: {
				id: {
					type: "string",
					description: "The id of the save to unsave",
				},
			},
			required: ["id"],
			additionalProperties: false,
		},
	},
};

export { tool as deleteSaveTool };
