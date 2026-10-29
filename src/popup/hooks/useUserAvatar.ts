import { useLiveQuery } from "dexie-react-hooks";
import { littleDB } from "../../storage/pageDB";

// A profile's avatar image, plain for the lock screen (0010).
const useUserAvatar = (profileId: string | undefined): Blob | undefined =>
	useLiveQuery(
		async () =>
			profileId === undefined
				? undefined
				: (await littleDB.avatars.get(profileId))?.image,
		[profileId],
		undefined,
	);

export { useUserAvatar };
