import { LTask } from "little-shared/types";
import { db } from "../../utils/db";
import { useLiveQuery } from "dexie-react-hooks";

const useTasks = (): Array<LTask> | undefined => {
	return useLiveQuery(() => db.taskTbl.toArray(), [], undefined);
};

export { useTasks };
