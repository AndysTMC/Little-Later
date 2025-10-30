import { LEXPORT_TYPE } from "little-shared/enums";
import {
	exportDataReadable,
	exportDataImportable,
} from "../../../services/dataExchange";

const toolCall = async ({
	type,
}: {
	type: LEXPORT_TYPE;
}): Promise<() => Promise<void>> => {
	return async () => {
		if (type === LEXPORT_TYPE.READABLE) {
			await exportDataReadable();
		} else if (type === LEXPORT_TYPE.IMPORTABLE) {
			await exportDataImportable();
		}
	};
};

export { toolCall as exportDataToolCall };
