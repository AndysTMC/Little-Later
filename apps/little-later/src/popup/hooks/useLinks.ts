import { LLink } from "little-shared/types";
import { db } from "../../utils/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useLocalSocket } from "./useLocalSocket";
import { getLinks } from "../../services/link";

const useLinks = (): Array<LLink> | undefined => {
	const dbResult = useLiveQuery(() => db.linkTbl.toArray(), [], undefined);

	const socket = useLocalSocket();

	const [localResult, setLocalResult] = useState<Array<LLink> | undefined>(
		undefined,
	);

	useEffect(() => {
		socket?.on("linksChange", () => {
			getLinks().then((links) => {
				setLocalResult(links);
			});
		});
		return () => {
			socket?.off("linksChange");
		};
	}, [socket]);

	useEffect(() => {
		getLinks().then((links) => {
			setLocalResult(links);
		});
	}, [setLocalResult]);

	return socket ? localResult : dbResult;
};

export { useLinks };
