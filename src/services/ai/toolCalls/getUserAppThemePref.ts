import { readProfile } from "../records";
import type { AIOwner } from "../owner";

// "system", "light" or "dark".
const toolCall = async (owner: AIOwner) =>
	(await readProfile(await owner.keys())).prefs.theme;

export { toolCall as getUserAppThemePrefToolCall };
