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
	// The answer says which profile it is for. A live query keeps its last
	// answer while the next one loads, so without this the "no profile"
	// answer from before the session was read stood in for the unlocked
	// profile for a moment, and a popup opened on an inner page was sent
	// to the profile picker.
	const found = useLiveQuery(
		async () => ({
			profileId,
			row:
				profileId === undefined
					? null
					: ((await littleDB.profiles.get(profileId)) ?? null),
		}),
		[profileId],
		undefined,
	);
	const row = found && found.profileId === profileId ? found.row : undefined;
	// One object per row, so effects that depend on the profile run when
	// it changes, not on every render.
	const profile = useMemo(
		() => (row ? toUserProfile(row) : undefined),
		[row],
	);
	if (!isResolved || row === undefined) {
		return { isResolved: false, profile: undefined };
	}
	return { isResolved: true, profile };
};

const useCurrentUserProfile = (): UserProfile | undefined =>
	useResolvedCurrentUser().profile;

export { useCurrentUserProfile, useResolvedCurrentUser };
