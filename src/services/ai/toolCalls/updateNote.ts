import { getNote, updateNote } from "../../../services/note";

const toolCall = async (
	id: number,
	content: string,
): Promise<() => Promise<void>> => {
	const note = await getNote(id);
	if (note === undefined) {
		throw new Error("Note not found.");
	}
	const modifiedNote = {
		...note,
		content: content ?? note.content,
	};
	return async () => {
		await updateNote(note.id, modifiedNote);
	};
};

export { toolCall as updateNoteToolCall };
