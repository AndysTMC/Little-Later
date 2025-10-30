import { LUserAvatar } from "little-shared/types";
import { db } from "../../utils/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useLocalSocket } from "./useLocalSocket";
import { useEffect, useState } from "react";
import { getUserAvatar } from "../../services/user";

const useUserAvatar = (userId: number | undefined): LUserAvatar | undefined => {
	const dbResult = useLiveQuery(
		() => {
			if (userId === undefined) return undefined;
			return db.userAvatarTbl.get(userId);
		},
		[userId],
		undefined,
	);

	const socket = useLocalSocket();

	const [localResult, setLocalResult] = useState<LUserAvatar | undefined>(
		undefined,
	);

	useEffect(() => {
		socket?.on("userAvatarsChange", () => {
			if (userId === undefined) return;
			getUserAvatar(userId).then((userAvatar) => {
				setLocalResult({
					userId,
					blob: userAvatar,
				});
			});
		});
		return () => {
			socket?.off("userAvatarsChange");
		};
	}, [socket, userId]);

	useEffect(() => {
		if (userId === undefined) return;
		getUserAvatar(userId).then((userAvatar) => {
			setLocalResult({
				userId,
				blob: userAvatar,
			});
		});
	}, [userId]);

	return socket ? localResult : dbResult;
};

export { useUserAvatar };
