import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "get_current_date_time_info",
		description:
			"Fetches the current date and time information from the system",
		parameters: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
		strict: true,
	},
};

export { tool as getCurrentDateTimeInfoTool };
