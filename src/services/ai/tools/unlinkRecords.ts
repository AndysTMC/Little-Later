import type OpenAI from "openai";

export const unlinkRecordsTool: OpenAI.Chat.Completions.ChatCompletionFunctionTool =
	{
		type: "function",
		function: {
			name: "unlink_records",
			description:
				"Remove a link between two existing records. Requires valid ids and user confirmation.",
			parameters: {
				type: "object",
				properties: {
					fromId: {
						type: "string",
						description: "The id of the source record.",
					},
					toId: {
						type: "string",
						description: "The id of the target record.",
					},
				},
				required: ["fromId", "toId"],
			},
		},
	};
