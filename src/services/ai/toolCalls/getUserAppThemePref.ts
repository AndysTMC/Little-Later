import { readProfile, unlockedKeys } from "../records";

// "system", "light" or "dark".
const toolCall = async () =>
	(await readProfile(await unlockedKeys())).prefs.theme;

export { toolCall as getUserAppThemePrefToolCall };
