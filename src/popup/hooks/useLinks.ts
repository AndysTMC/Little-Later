import { LLink } from "little-shared/types";
import { db } from "../../utils/db";
import { useLiveQuery } from "dexie-react-hooks";

const useLinks = (): Array<LLink> | undefined => {
	return useLiveQuery(() => db.linkTbl.toArray(), [], undefined);
};

export { useLinks };
