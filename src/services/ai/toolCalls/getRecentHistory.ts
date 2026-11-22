import { listRecentHistory, type Save } from "../../../storage/repositories";
import { littleDB } from "../../../storage/pageDB";
import type { AIOwner } from "../owner";

// Pages in history, most recent visit first.
const toolCall = async (owner: AIOwner, limit = 10): Promise<Array<Save>> => {
	const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 20));
	return listRecentHistory(littleDB, await owner.keys(), safeLimit);
};

export { toolCall as getRecentHistoryToolCall };
