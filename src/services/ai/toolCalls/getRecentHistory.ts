import { LINT_BOOLEAN } from "little-shared/enums";
import { LVisualBM } from "little-shared/types";
import { db } from "../../../utils/db";

const toolCall = async (limit = 10): Promise<Array<LVisualBM>> => {
	const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 20));
	const saves = await db.visualBMTbl.toArray();
	return saves
		.filter((save) => save.hasBrowsed === LINT_BOOLEAN.TRUE)
		.sort((a, b) => {
			const aTs = Date.parse(a.lastBrowseDate);
			const bTs = Date.parse(b.lastBrowseDate);
			return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
		})
		.slice(0, safeLimit);
};

export { toolCall as getRecentHistoryToolCall };
