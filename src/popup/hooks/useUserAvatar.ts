import { LUserAvatar } from "little-shared/types";
import { db } from "../../utils/db";
import { useLiveQuery } from "dexie-react-hooks";

const useUserAvatar = (userId: number | undefined): LUserAvatar | undefined => {
	return useLiveQuery(
		() => {
			if (userId === undefined) {
				return undefined;
			}
			return db.userAvatarTbl.get(userId);
		},
		[userId],
		undefined,
	);
};

export { useUserAvatar };
