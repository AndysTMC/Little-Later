import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "format_date_time",
		description:
			"Builds a valid Little Later date-time string from numeric parts using local timezone",
		parameters: {
			type: "object",
			properties: {
				year: {
					type: "number",
					description: "Year (e.g. 2026)",
				},
				month: {
					type: "number",
					description: "Month as 1-12",
				},
				day: {
					type: "number",
					description: "Day of month as 1-31",
				},
				hour: {
					type: "number",
					description: "Hour in 24-hour format as 0-23",
				},
				minute: {
					type: "number",
					description: "Minute as 0-59",
				},
				second: {
					type: "number",
					description: "Second as 0-59 (optional, defaults to 0)",
				},
			},
			required: ["year", "month", "day", "hour", "minute"],
			additionalProperties: false,
		},
		strict: true,
	},
};

export { tool as formatDateTimeTool };
