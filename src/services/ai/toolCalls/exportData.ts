import { LEXPORT_TYPE } from "little-shared/enums";
import { exportBackup, exportReadable } from "../../backup";
import type { AIOwner } from "../owner";

const toolCall = async (
	owner: AIOwner,
	{
		type,
		password,
	}: {
		type: LEXPORT_TYPE;
		password?: string;
	},
): Promise<() => Promise<void>> => {
	return async () => {
		if (type === LEXPORT_TYPE.READABLE) {
			await exportReadable(owner.keys);
		} else if (type === LEXPORT_TYPE.IMPORTABLE) {
			await exportBackup(password ?? "", owner.keys);
		}
	};
};

export { toolCall as exportDataToolCall };
