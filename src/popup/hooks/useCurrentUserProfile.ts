import { LUserProfile } from "little-shared/types";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../utils/db";
import { LINT_BOOLEAN } from "little-shared/enums";

const useCurrentUserProfile = (): LUserProfile | undefined => {
	return useLiveQuery(
		() =>
			db.userProfileTbl
				.where("isCurrent")
				.equals(LINT_BOOLEAN.TRUE)
				.first(),
		[],
		undefined,
	);
};

export { useCurrentUserProfile };
