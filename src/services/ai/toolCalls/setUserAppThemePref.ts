import { LTHEME } from "little-shared/enums";
import { send } from "../../../utils/send";
import { readProfile, unlockedKeys } from "../records";

const PROFILE_THEME = {
	[LTHEME.LIGHT]: "light",
	[LTHEME.DARK]: "dark",
} as const;

const toolCall = async ({
	theme,
}: {
	theme: LTHEME;
}): Promise<() => Promise<void>> => {
	if (theme !== LTHEME.LIGHT && theme !== LTHEME.DARK) {
		throw new Error("Invalid theme preference.");
	}
	const profile = await readProfile(await unlockedKeys());
	if (profile.prefs.theme === PROFILE_THEME[theme]) {
		throw new Error("The theme is already set to " + theme);
	}
	return async () => {
		await send("profile.update", { theme: PROFILE_THEME[theme] });
	};
};

export { toolCall as setUserAppThemePrefToolCall };
