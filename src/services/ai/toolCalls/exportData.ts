import { LEXPORT_TYPE } from "little-shared/enums";
import { exportBackup, exportReadable } from "../../backup";

const toolCall = async ({
	type,
	password,
}: {
	type: LEXPORT_TYPE;
	password?: string;
}): Promise<() => Promise<void>> => {
	return async () => {
		if (type === LEXPORT_TYPE.READABLE) {
			await exportReadable();
		} else if (type === LEXPORT_TYPE.IMPORTABLE) {
			await exportBackup(password ?? "");
		}
	};
};

export { toolCall as exportDataToolCall };
