import { LTHEME } from "little-shared/enums";
import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
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
		strict: true,
	},
};
export { tool as setUserAppThemePrefTool };
