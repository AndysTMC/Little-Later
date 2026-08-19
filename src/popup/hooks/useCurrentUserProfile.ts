import { LUserProfile } from "little-shared/types";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../utils/db";
import { LINT_BOOLEAN } from "little-shared/enums";

const queryCurrentUserProfile = () =>
	db.userProfileTbl.where("isCurrent").equals(LINT_BOOLEAN.TRUE).first();

const useCurrentUserProfile = (): LUserProfile | undefined => {
	return useLiveQuery(queryCurrentUserProfile, [], undefined);
};

const useResolvedCurrentUser = (): {
	isResolved: boolean;
	profile: LUserProfile | undefined;
} => {
	// null is only the loading default. After Dexie answers, no current
	// profile is `undefined` and an unlocked profile is the row itself.
	const result = useLiveQuery(queryCurrentUserProfile, [], null);
	return {
		isResolved: result !== null,
		profile: result ?? undefined,
	};
};

export { useCurrentUserProfile, useResolvedCurrentUser };
