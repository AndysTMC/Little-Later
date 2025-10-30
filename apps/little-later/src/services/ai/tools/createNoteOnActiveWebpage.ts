import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "create_note_on_active_webpage",
		description: "Saves a note on the current web page",
		parameters: {
			type: "object",
			properties: {
				content: {
					type: "string",
					description:
						"The note with the provided content to be added to the current web page or save (if already converted to save)",
				},
			},
			required: ["content"],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as createNoteOnActiveWebpageTool };
