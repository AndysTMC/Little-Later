import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { littleDB } from "../../storage/pageDB";
import { useSession } from "./useSession";
import { toUserProfile, type UserProfile } from "./useUserProfiles";

// The unlocked profile. isResolved turns true once the session and, when
// one is unlocked, its profile row have been read.
const useResolvedCurrentUser = (): {
	isResolved: boolean;
	profile: UserProfile | undefined;
} => {
	const { isResolved, session } = useSession();
	const profileId = session?.profileId;
	const row = useLiveQuery(
		async () =>
			profileId === undefined
				? null
				: ((await littleDB.profiles.get(profileId)) ?? null),
		[profileId],
		undefined,
	);
	// One object per row, so effects that depend on the profile run when
	// it changes, not on every render.
	const profile = useMemo(
		() => (row ? toUserProfile(row) : undefined),
		[row],
	);
	if (!isResolved || (profileId !== undefined && row === undefined)) {
		return { isResolved: false, profile: undefined };
	}
	return { isResolved: true, profile };
};

const useCurrentUserProfile = (): UserProfile | undefined =>
	useResolvedCurrentUser().profile;

export { useCurrentUserProfile, useResolvedCurrentUser };
