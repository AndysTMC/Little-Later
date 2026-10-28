import { send } from "../../../utils/send";

const toolCall = async ({
	content,
}: {
	content: string;
}): Promise<() => Promise<void>> => {
	return async () => {
		await send("note.create", { content });
	};
};

export { toolCall as createNoteToolCall };
