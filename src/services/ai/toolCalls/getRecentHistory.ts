import type { Save } from "../../../storage/repositories";
import { readSaves, unlockedKeys } from "../records";

// Pages in history, most recent visit first.
const toolCall = async (limit = 10): Promise<Array<Save>> => {
	const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 20));
	return (await readSaves(await unlockedKeys()))
		.filter((save) => save.browsed)
		.sort((a, b) => b.browsedAt - a.browsedAt)
		.slice(0, safeLimit);
};

export { toolCall as getRecentHistoryToolCall };
