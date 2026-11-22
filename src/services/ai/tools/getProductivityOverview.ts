import type OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionFunctionTool = {
	type: "function",
	function: {
		name: "get_productivity_overview",
		description:
			"Gets a quick overview of notes, saves, reminders, and task status for the current profile",
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: false,
		},
	},
};

export { tool as getProductivityOverviewTool };
