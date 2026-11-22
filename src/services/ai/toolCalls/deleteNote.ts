import { readNotes } from "../records";
import type { AIOwner } from "../owner";

const toolCall = async (
	owner: AIOwner,
	{
		id,
	}: {
		id: string;
	},
): Promise<() => Promise<void>> => {
	const note = (await readNotes(await owner.keys())).find(
		(item) => item.id === id,
	);
	if (note === undefined) {
		throw new Error("Note not found.");
	}
	return async () => {
		await owner.send("note.delete", { id });
	};
};

export { toolCall as deleteNoteToolCall };
