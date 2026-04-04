import { LVisualBM } from "little-shared/types";
import { db } from "../../utils/db";
import { useLiveQuery } from "dexie-react-hooks";

const useVisualBMs = (): Array<LVisualBM> | undefined => {
	return useLiveQuery(() => db.visualBMTbl.toArray(), [], undefined);
};

export { useVisualBMs };
