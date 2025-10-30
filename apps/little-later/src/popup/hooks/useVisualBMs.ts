import { LVisualBM } from "little-shared/types";
import { db } from "../../utils/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useLocalSocket } from "./useLocalSocket";
import { useEffect, useState } from "react";
import { getVisualBMs } from "../../services/visualBM";

const useVisualBMs = (): Array<LVisualBM> | undefined => {
	const dbResult = useLiveQuery(
		() => db.visualBMTbl.toArray(),
		[],
		undefined,
	);
	const socket = useLocalSocket();

	const [localResult, setLocalResult] = useState<
		Array<LVisualBM> | undefined
	>(undefined);

	useEffect(() => {
		socket?.on("visualBMsChange", () => {
			getVisualBMs().then((visualBMs) => {
				setLocalResult(visualBMs);
			});
		});
		return () => {
			socket?.off("visualBMsChange");
		};
	}, [socket]);

	useEffect(() => {
		getVisualBMs().then((visualBMs) => {
			setLocalResult(visualBMs);
		});
	}, []);

	return socket ? localResult : dbResult;
};

export { useVisualBMs };
