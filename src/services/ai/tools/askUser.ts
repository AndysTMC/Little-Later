import type OpenAI from "openai";

// Asks the user to choose (decision 0017). The question ends the turn: it is
// shown above the user's input with its options, and the user's choice, or
// their own words, comes back as their next message.
const tool: OpenAI.Chat.Completions.ChatCompletionFunctionTool = {
	type: "function",
	function: {
		name: "ask_user",
		description:
			"Ask the user one short question when their request is ambiguous or a choice is theirs to make, with 2 to 5 options to pick from. Their answer arrives as their next message. Don't use it for anything you can find out with another tool, and don't use it to confirm changes: those are confirmed separately.",
		parameters: {
			type: "object",
			properties: {
				question: {
					type: "string",
					description: "The question, one sentence.",
				},
				options: {
					type: "array",
					items: { type: "string" },
					description: "2 to 5 short answers to choose from.",
				},
				allowOther: {
					type: "boolean",
					description:
						"Whether the user may answer in their own words instead.",
				},
			},
			required: ["question", "options"],
			additionalProperties: false,
		},
	},
};

export { tool as askUserTool };
