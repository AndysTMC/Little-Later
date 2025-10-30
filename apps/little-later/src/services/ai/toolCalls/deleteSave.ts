import { LINT_BOOLEAN } from "little-shared/enums";
import { getVisualBM, updateVisualBM } from "../../../services/visualBM";

const toolCall = async ({
	id,
}: {
	id: number;
}): Promise<() => Promise<void>> => {
	return async () => {
		const visualBM = await getVisualBM(id);
		if (visualBM === undefined || visualBM.isSaved === LINT_BOOLEAN.FALSE) {
			throw new Error("LVisualBM not found or is not saved.");
		}
		await updateVisualBM(visualBM.url, {
			isSaved: LINT_BOOLEAN.FALSE,
		});
	};
};

export { toolCall as deleteSaveToolCall };
