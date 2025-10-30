import { deleteNote } from "../../../services/note";

const toolCall = async ({
	id,
}: {
	id: number;
}): Promise<() => Promise<void>> => {
	return async () => {
		await deleteNote(id);
	};
};

export { toolCall as deleteNoteToolCall };
