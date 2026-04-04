import { LNote } from "little-shared/types";
import { db } from "../../utils/db";
import { useLiveQuery } from "dexie-react-hooks";

const useNotes = (): Array<LNote> | undefined => {
	return useLiveQuery(() => db.noteTbl.toArray(), [], undefined);
};

export { useNotes };
