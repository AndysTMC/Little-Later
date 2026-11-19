import { LTHEME } from "little-shared/enums";
import { readProfile } from "../records";
import type { AIOwner } from "../owner";

const PROFILE_THEME = {
	[LTHEME.LIGHT]: "light",
	[LTHEME.DARK]: "dark",
} as const;

const toolCall = async (
	owner: AIOwner,
	{
		theme,
	}: {
		theme: LTHEME;
	},
): Promise<() => Promise<void>> => {
	if (theme !== LTHEME.LIGHT && theme !== LTHEME.DARK) {
		throw new Error("Invalid theme preference.");
	}
	const profile = await readProfile(await owner.keys());
	if (profile.prefs.theme === PROFILE_THEME[theme]) {
		throw new Error("The theme is already set to " + theme);
	}
	return async () => {
		await owner.send("profile.update", { theme: PROFILE_THEME[theme] });
	};
};

export { toolCall as setUserAppThemePrefToolCall };
