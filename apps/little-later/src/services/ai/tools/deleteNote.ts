import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "delete_note",
		description: "Deletes the note with the given id",
		parameters: {
			type: "object",
			properties: {
				id: {
					type: "number",
					description: "The id of the note to be deleted",
				},
			},
			required: ["id"],
			additionalProperties: false,
		},
		strict: true,
	},
};

export { tool as deleteNoteTool };
