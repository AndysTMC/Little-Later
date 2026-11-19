import { readSaves } from "../records";
import type { AIOwner } from "../owner";

const toolCall = async (
	owner: AIOwner,
	{
		id,
		customName,
	}: {
		id: string;
		customName: string;
	},
): Promise<() => Promise<void>> => {
	const save = (await readSaves(await owner.keys())).find(
		(item) => item.id === id,
	);
	if (save === undefined) {
		throw new Error("Save not found.");
	}
	return async () => {
		await owner.send("save.update", { id, customName });
	};
};

export { toolCall as updateSaveToolCall };
