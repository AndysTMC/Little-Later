import type OpenAI from "openai";

export const linkRecordsTool: OpenAI.Chat.Completions.ChatCompletionFunctionTool =
	{
		type: "function",
		function: {
			name: "link_records",
			description:
				"Link two existing records (for example a note, task, or reminder to a saved page). Requires valid ids from search tools and user confirmation.",
			parameters: {
				type: "object",
				properties: {
					fromId: {
						type: "string",
						description:
							"The id of the source record (note, task, or reminder).",
					},
					toId: {
						type: "string",
						description:
							"The id of the target record (typically a save).",
					},
				},
				required: ["fromId", "toId"],
			},
		},
	};
