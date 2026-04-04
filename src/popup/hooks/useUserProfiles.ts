import { LUserProfile } from "little-shared/types";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../utils/db";

const useUserProfiles = (): Array<LUserProfile> | undefined => {
	return useLiveQuery(() => db.userProfileTbl.toArray(), [], undefined);
};

export { useUserProfiles };
