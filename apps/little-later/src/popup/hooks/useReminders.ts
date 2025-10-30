import { LReminder } from "little-shared/types";
import { db } from "../../utils/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useLocalSocket } from "./useLocalSocket";
import { useEffect, useState } from "react";
import { getReminders } from "../../services/reminder";

const useReminders = (): Array<LReminder> | undefined => {
	const dbResult = useLiveQuery(
		async () => db.reminderTbl.toArray(),
		[],
		undefined,
	);
	const socket = useLocalSocket();

	const [localResult, setLocalResult] = useState<
		Array<LReminder> | undefined
	>(undefined);

	useEffect(() => {
		socket?.on("remindersChange", () => {
			getReminders().then((reminders) => {
				setLocalResult(reminders);
			});
		});
		return () => {
			socket?.off("remindersChange");
		};
	}, [socket]);

	useEffect(() => {
		getReminders().then((reminders) => {
			setLocalResult(reminders);
		});
	}, []);

	return socket ? localResult : dbResult;
};

export { useReminders };
