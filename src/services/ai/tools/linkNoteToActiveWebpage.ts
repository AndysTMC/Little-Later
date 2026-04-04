import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "link_note_to_active_webpage",
		description: "Links a note to the current or active web page",
		parameters: {
			type: "object",
			properties: {
				id: {
					type: "number",
					description:
						"The note id by which the current web page or save (if already converted to save) is linked to the note",
				},
			},
			required: ["id"],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as linkNoteToActiveWebpageTool };
