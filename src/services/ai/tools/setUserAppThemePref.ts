import { LTHEME } from "little-shared/enums";
import type OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionFunctionTool = {
	type: "function",
	function: {
		name: "set_user_app_theme_pref",
		description: "Sets the user's app theme preference in the database",
		parameters: {
			type: "object",
			properties: {
				theme: {
					type: "string",
					enum: [LTHEME.LIGHT, LTHEME.DARK],
					description: "The theme preference of the user",
				},
			},
			required: ["theme"],
			additionalProperties: false,
		},
	},
};
export { tool as setUserAppThemePrefTool };
