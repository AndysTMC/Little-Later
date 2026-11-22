import { ownerOf } from "../../src/services/ai/owner";
import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { LAI_PROVIDERS } from "little-shared/enums";
import {
	AIUnavailableError,
	OpenAICompatibleAI,
} from "../../src/services/ai/main";

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// Reaches the history the way the chat loop does.
class ProbeAI extends OpenAICompatibleAI {
	add(message: Message) {
		this.appendMessage(message);
	}
	get history(): Array<Message> {
		return this.messages;
	}
}

const unconfigured = () =>
	new ProbeAI({
		// Unconfigured, it never calls a provider or reads a profile.
		owner: ownerOf({ profileId: "unused", unlockId: "unused" }),
		model: "",
		provider: LAI_PROVIDERS.OLLAMA,
		apiKey: "",
		baseUrl: "",
	});

describe("text helpers", () => {
	// They used to hand back their input, so "Note quick summary (AI)"
	// stored the raw selection and reported a summary.
	it("fail when the AI is not set up, instead of echoing the input", async () => {
		const ai = unconfigured();
		await expect(ai.summarize("some text")).rejects.toBeInstanceOf(
			AIUnavailableError,
		);
		await expect(ai.rewrite("some text")).rejects.toBeInstanceOf(
			AIUnavailableError,
		);
		await expect(ai.write("some text")).rejects.toBeInstanceOf(
			AIUnavailableError,
		);
	});
});

describe("chat history", () => {
	// A tool result whose assistant call was cut away is an invalid
	// conversation: providers reject every request that follows.
	it("is trimmed at a user turn, never between a tool call and its result", () => {
		const ai = unconfigured();
		for (let turn = 0; turn < 30; turn++) {
			ai.add({ role: "user", content: `question ${turn}` });
			ai.add({
				role: "assistant",
				content: "",
				tool_calls: [
					{
						id: `call-${turn}`,
						type: "function",
						function: { name: "search_notes", arguments: "{}" },
					},
				],
			});
			ai.add({
				role: "tool",
				tool_call_id: `call-${turn}`,
				content: "{}",
			});
			ai.add({ role: "assistant", content: `answer ${turn}` });

			const [system, first, ...rest] = ai.history;
			expect(system.role).toBe("system");
			expect(first.role).toBe("user");
			// Every tool result still follows the call it answers.
			const all = [first, ...rest];
			all.forEach((message, index) => {
				if (message.role === "tool") {
					const before = all[index - 1];
					expect(before.role).toBe("assistant");
				}
			});
		}
		expect(ai.history.length).toBeLessThanOrEqual(41);
	});
});
