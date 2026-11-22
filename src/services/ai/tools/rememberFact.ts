import type OpenAI from "openai";

export const rememberFactTool: OpenAI.Chat.Completions.ChatCompletionFunctionTool =
	{
		type: "function",
		function: {
			name: "remember_fact",
			description:
				"Save a short preference or durable fact into LittleAI memories for this profile so future chats remember it. Requires user confirmation.",
			parameters: {
				type: "object",
				properties: {
					text: {
						type: "string",
						description:
							"A concise single-sentence fact or preference to remember (max 240 characters).",
					},
				},
				required: ["text"],
			},
		},
	};
