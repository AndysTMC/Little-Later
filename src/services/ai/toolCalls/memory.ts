import { readSettings } from "../records";
import type { AIOwner } from "../owner";

const rememberFactToolCall = async (
	owner: AIOwner,
	{ text }: { text: string },
): Promise<() => Promise<void>> => {
	const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 240);
	if (cleaned === "") {
		throw new Error("text is required.");
	}
	return async () => {
		await owner.send("settings.update", {
			ai: {
				memoryOp: {
					op: "add",
					entry: {
						id: crypto.randomUUID(),
						text: cleaned,
						createdAt: Date.now(),
					},
				},
			},
		});
	};
};

const forgetFactToolCall = async (
	owner: AIOwner,
	{ id, query }: { id?: string; query?: string },
): Promise<() => Promise<void>> => {
	const keys = await owner.keys();
	const { ai } = await readSettings(keys);
	const existing = ai.memories ?? [];
	const target = id
		? existing.find((memory) => memory.id === id)
		: query
			? existing.find((memory) =>
					memory.text
						.toLowerCase()
						.includes(query.trim().toLowerCase()),
				)
			: undefined;
	if (!target) {
		throw new Error("Memory not found.");
	}
	return async () => {
		await owner.send("settings.update", {
			ai: {
				memoryOp: {
					op: "remove",
					id: target.id,
				},
			},
		});
	};
};

export { rememberFactToolCall, forgetFactToolCall };
