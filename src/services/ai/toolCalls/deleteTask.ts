import { deleteTask } from "../../../services/task";

const toolCall = async ({
	id,
}: {
	id: number;
}): Promise<() => Promise<void>> => {
	return async () => {
		await deleteTask(id);
	};
};

export { toolCall as deleteTaskToolCall };
