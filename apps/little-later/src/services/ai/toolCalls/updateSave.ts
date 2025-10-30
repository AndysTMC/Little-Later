import { LINT_BOOLEAN } from "little-shared/enums";
import { getVisualBM, updateVisualBM } from "../../../services/visualBM";

const toolCall = async (
	id: number,
	name: string,
): Promise<() => Promise<void>> => {
	const visualBM = await getVisualBM(id);
	if (visualBM === undefined || visualBM.isSaved === LINT_BOOLEAN.FALSE) {
		throw new Error("LVisualBM not found or is not saved.");
	}
	const modifiedSave = {
		...visualBM,
		name: name ?? visualBM.customName,
	};
	return async () => {
		await updateVisualBM(visualBM.url, modifiedSave);
	};
};

export { toolCall as updateSaveToolCall };
