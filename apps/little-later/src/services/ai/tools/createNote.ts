import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "create_note",
		description: "Creates a note with the given information",
		parameters: {
			type: "object",
			properties: {
				content: {
					type: "string",
					description: "The content of the note",
				},
			},
			required: ["content"],
			additionalProperties: false,
		},
		strict: true,
	},
};

export { tool as createNoteTool };
