// A model's reasoning, closed or still being written, isn't the answer.
export const withoutThinking = (text: string): string =>
	text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
