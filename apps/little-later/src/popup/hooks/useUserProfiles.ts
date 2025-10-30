import { LUserProfile } from "little-shared/types";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../utils/db";
import { useLocalSocket } from "./useLocalSocket";
import { useEffect, useState } from "react";
import { getUserProfiles } from "../../services/user";

const useUserProfiles = (): Array<LUserProfile> | undefined => {
	const dbResult = useLiveQuery(
		() => {
			return db.userProfileTbl.toArray();
		},
		[],
		undefined,
	);

	const socket = useLocalSocket();

	const [localResult, setLocalResult] = useState<
		Array<LUserProfile> | undefined
	>(undefined);

	useEffect(() => {
		socket?.on("userProfilesChange", () => {
			getUserProfiles().then((userProfiles) => {
				setLocalResult(userProfiles);
			});
		});
		return () => {
			socket?.off("userProfilesChange");
		};
	}, [socket]);

	useEffect(() => {
		getUserProfiles().then((userProfiles) => {
			setLocalResult(userProfiles);
		});
	}, []);

	return socket ? localResult : dbResult;
};

export { useUserProfiles };
