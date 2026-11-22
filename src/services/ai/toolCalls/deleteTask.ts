import type { AIOwner } from "../owner";

const toolCall = async (
	owner: AIOwner,
	{
		id,
	}: {
		id: string;
	},
): Promise<() => Promise<void>> => {
	return async () => {
		await owner.send("task.delete", { id });
	};
};

export { toolCall as deleteTaskToolCall };
