import { LTask } from "little-shared/types";
import { db } from "../../utils/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useLocalSocket } from "./useLocalSocket";
import { getTasks } from "../../services/task";

const useTasks = (): Array<LTask> | undefined => {
	const dbResult = useLiveQuery(() => db.taskTbl.toArray(), [], undefined);

	const socket = useLocalSocket();

	const [localResult, setLocalResult] = useState<Array<LTask> | undefined>(
		undefined,
	);

	useEffect(() => {
		socket?.on("tasksChange", () => {
			getTasks().then((tasks) => {
				setLocalResult(tasks);
			});
		});
		return () => {
			socket?.off("tasksChange");
		};
	}, [socket]);

	useEffect(() => {
		getTasks().then((tasks) => {
			setLocalResult(tasks);
		});
	}, []);

	return socket ? localResult : dbResult;
};

export { useTasks };
