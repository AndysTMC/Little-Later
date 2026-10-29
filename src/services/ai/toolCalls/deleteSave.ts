import { send } from "../../../utils/send";
import { readSaves, unlockedKeys } from "../records";

// Deleting a save unsaves it; the page stays in history if it was there.
const toolCall = async ({
	id,
}: {
	id: string;
}): Promise<() => Promise<void>> => {
	return async () => {
		const save = (await readSaves(await unlockedKeys())).find(
			(item) => item.id === id,
		);
		if (save === undefined || !save.saved) {
			throw new Error("Save not found or is not saved.");
		}
		await send("save.update", { id, saved: false });
	};
};

export { toolCall as deleteSaveToolCall };
