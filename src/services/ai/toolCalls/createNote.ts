import { createNote } from "../../../services/note";

const toolCall = async ({
	content,
}: {
	content: string;
}): Promise<() => Promise<void>> => {
	return async () => {
		await createNote({ content });
	};
};

export { toolCall as createNoteToolCall };
