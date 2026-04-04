import { LReminder } from "little-shared/types";
import { db } from "../../utils/db";
import { useLiveQuery } from "dexie-react-hooks";

const useReminders = (): Array<LReminder> | undefined => {
	return useLiveQuery(() => db.reminderTbl.toArray(), [], undefined);
};

export { useReminders };
