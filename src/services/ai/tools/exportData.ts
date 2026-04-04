import { LEXPORT_TYPE } from "little-shared/enums";
import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "export_data",
		description: "Exports the user's data in JSON formats",
		parameters: {
			type: "object",
			properties: {
				type: {
					type: "string",
					description:
						"The type of export (default is readable, if not specified) (For transfering purpose, use importable)",
					enum: [LEXPORT_TYPE.READABLE, LEXPORT_TYPE.IMPORTABLE],
				},
			},
			required: ["type"],
			additionalProperties: false,
		},
	},
};

export { tool as exportDataTool };
