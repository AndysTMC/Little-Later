import { send } from "../../../utils/send";

const toolCall = async ({
	id,
}: {
	id: string;
}): Promise<() => Promise<void>> => {
	return async () => {
		await send("note.delete", { id });
	};
};

export { toolCall as deleteNoteToolCall };
