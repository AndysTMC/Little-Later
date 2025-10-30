import { LNote } from "little-shared/types";
import { db } from "../../utils/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useLocalSocket } from "./useLocalSocket";
import { useEffect, useState } from "react";
import { getNotes } from "../../services/note";

const useNotes = (): Array<LNote> | undefined => {
	const dbResult = useLiveQuery(() => db.noteTbl.toArray(), [], undefined);
	const socket = useLocalSocket();

	const [localResult, setLocalResult] = useState<Array<LNote> | undefined>(
		undefined,
	);

	useEffect(() => {
		socket?.on("notesChange", () => {
			getNotes().then((notes) => {
				setLocalResult(notes);
			});
		});
		return () => {
			socket?.off("notesChange");
		};
	}, [socket]);

	useEffect(() => {
		getNotes().then((notes) => {
			setLocalResult(notes);
		});
	}, []);

	return socket ? localResult : dbResult;
};

export { useNotes };
