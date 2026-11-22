import type OpenAI from "openai";

export const forgetFactTool: OpenAI.Chat.Completions.ChatCompletionFunctionTool =
	{
		type: "function",
		function: {
			name: "forget_fact",
			description:
				"Remove a previously saved LittleAI memory by its id or matching text. Requires user confirmation.",
			parameters: {
				type: "object",
				properties: {
					id: {
						type: "string",
						description: "The id of the memory to forget.",
					},
					query: {
						type: "string",
						description:
							"Matching text if the exact memory id is not known.",
					},
				},
				required: [],
			},
		},
	};
