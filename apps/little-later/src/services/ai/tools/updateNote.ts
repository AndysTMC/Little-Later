import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "update_note",
		description: "Updates the note with the given information",
		parameters: {
			type: "object",
			properties: {
				content: {
					type: "string",
					description: "The updated content of the note",
				},
				id: {
					type: "number",
					description: "The id of the note to be updated",
				},
			},
			required: ["content", "id"],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as updateNoteTool };
