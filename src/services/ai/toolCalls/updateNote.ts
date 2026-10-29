import { send } from "../../../utils/send";
import { readNotes, unlockedKeys } from "../records";

const toolCall = async (
	id: string,
	content: string,
): Promise<() => Promise<void>> => {
	const note = (await readNotes(await unlockedKeys())).find(
		(item) => item.id === id,
	);
	if (note === undefined) {
		throw new Error("Note not found.");
	}
	return async () => {
		await send("note.update", { id, content });
	};
};

export { toolCall as updateNoteToolCall };
