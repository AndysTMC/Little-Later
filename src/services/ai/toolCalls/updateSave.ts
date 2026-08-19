import { getVisualBM, updateVisualBM } from "../../../services/visualBM";

const toolCall = async ({
	id,
	customName,
}: {
	id: number;
	customName: string;
}): Promise<() => Promise<void>> => {
	const save = await getVisualBM(id);
	if (save === undefined) {
		throw new Error("Save not found.");
	}
	return async () => {
		await updateVisualBM(save.url, { customName });
	};
};

export { toolCall as updateSaveToolCall };
