import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "get_save_preview_image",
		description:
			"Gets a save preview image and returns markdown for display in chat",
		parameters: {
			type: "object",
			properties: {
				id: {
					type: "number",
					description: "Save id",
				},
				url: {
					type: "string",
					description: "Save URL",
				},
				query: {
					type: "string",
					description:
						"Search query to find a matching save when id/url is not provided",
				},
			},
			required: [],
			additionalProperties: false,
		},
		strict: true,
	},
};

export { tool as getSavePreviewImageTool };
