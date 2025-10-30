import { LUserProfile } from "little-shared/types";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../utils/db";
import { LINT_BOOLEAN } from "little-shared/enums";
import { useLocalSocket } from "./useLocalSocket";
import { useEffect, useState } from "react";
import { getCurrentUserProfile } from "../../services/user";

const useCurrentUserProfile = (): LUserProfile | undefined => {
	const dbResult = useLiveQuery(
		() =>
			db.userProfileTbl
				.where("isCurrent")
				.equals(LINT_BOOLEAN.TRUE)
				.first(),
		[],
		undefined,
	);

	const socket = useLocalSocket();

	const [localResult, setLocalResult] = useState<LUserProfile | undefined>(
		undefined,
	);

	useEffect(() => {
		socket?.on("userProfilesChange", () => {
			getCurrentUserProfile().then((currentUserProfile) => {
				setLocalResult(currentUserProfile);
			});
		});
		return () => {
			socket?.off("userProfilesChange");
		};
	}, [socket]);

	useEffect(() => {
		getCurrentUserProfile().then((currentUserProfile) => {
			setLocalResult(currentUserProfile);
		});
	}, []);

	return socket ? localResult : dbResult;
};

export { useCurrentUserProfile };
