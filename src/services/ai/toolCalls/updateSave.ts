import { send } from "../../../utils/send";
import { readSaves, unlockedKeys } from "../records";

const toolCall = async ({
	id,
	customName,
}: {
	id: string;
	customName: string;
}): Promise<() => Promise<void>> => {
	const save = (await readSaves(await unlockedKeys())).find(
		(item) => item.id === id,
	);
	if (save === undefined) {
		throw new Error("Save not found.");
	}
	return async () => {
		await send("save.update", { id, customName });
	};
};

export { toolCall as updateSaveToolCall };
