import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "search_saves",
		description:
			"Function to search saves by name, url, domain, and notes linked to it",
		parameters: {
			type: "object",
			properties: {
				domain: {
					type: "string",
					description: "The domain of the website",
				},
				query: {
					type: "string",
					description:
						"The user's query with all necessary information to search the saves",
				},
				url: {
					type: "string",
					description: "The URL of the website",
				},
			},
			required: ["domain", "query", "url"],
			additionalProperties: false,
		},
		strict: true,
	},
};
export { tool as searchSavesTool };
