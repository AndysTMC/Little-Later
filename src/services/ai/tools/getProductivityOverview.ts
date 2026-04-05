import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
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
		strict: true,
	},
};

export { tool as getProductivityOverviewTool };
