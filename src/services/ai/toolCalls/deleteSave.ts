import { readSaves } from "../records";
import type { AIOwner } from "../owner";

// Deleting a save unsaves it; the page stays in history if it was there.
const toolCall = async (
	owner: AIOwner,
	{
		id,
	}: {
		id: string;
	},
): Promise<() => Promise<void>> => {
	return async () => {
		const save = (await readSaves(await owner.keys())).find(
			(item) => item.id === id,
		);
		if (save === undefined || !save.saved) {
			throw new Error("Save not found or is not saved.");
		}
		await owner.send("save.update", { id, saved: false });
	};
};

export { toolCall as deleteSaveToolCall };
