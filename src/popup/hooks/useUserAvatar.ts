import { useLiveQuery } from "dexie-react-hooks";
import { littleDB } from "../../storage/pageDB";

// A profile's avatar image, plain for the lock screen (0010).
const useUserAvatar = (profileId: string | undefined): Blob | undefined => {
	const loaded = useLiveQuery(
		async () =>
			profileId === undefined
				? undefined
				: {
						profileId,
						image: (await littleDB.avatars.get(profileId))?.image,
					},
		[profileId],
		undefined,
	);
	return loaded && loaded.profileId === profileId ? loaded.image : undefined;
};

export { useUserAvatar };
