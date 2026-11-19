import type { AIOwner } from "../owner";

const toolCall = async (
	owner: AIOwner,
	{
		content,
	}: {
		content: string;
	},
): Promise<() => Promise<void>> => {
	return async () => {
		await owner.send("note.create", { content });
	};
};

export { toolCall as createNoteToolCall };
