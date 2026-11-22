import type { AIOwner } from "../owner";

const linkRecordsToolCall = async (
	owner: AIOwner,
	{ fromId, toId }: { fromId: string; toId: string },
): Promise<() => Promise<void>> => {
	return async () => {
		await owner.send("link.create", { fromId, toId });
	};
};

const unlinkRecordsToolCall = async (
	owner: AIOwner,
	{ fromId, toId }: { fromId: string; toId: string },
): Promise<() => Promise<void>> => {
	return async () => {
		await owner.send("link.delete", { fromId, toId });
	};
};

export { linkRecordsToolCall, unlinkRecordsToolCall };
