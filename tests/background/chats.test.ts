// @vitest-environment node
// Node, not jsdom: see tests/storage/profiles.test.ts.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unlockedKeys } from "../../src/services/ai/records";
import { littleDB } from "../../src/storage/pageDB";
import {
	listChatMessages,
	listChats,
	listLatestChatMessages,
} from "../../src/storage/repositories";
import { send } from "../../src/utils/send";
import { freshProfile } from "../ai/profile";

// LittleAI's chats (decision 0017): sealed like every record, kept in
// order, and removed with their profile.

beforeEach(freshProfile);
afterEach(() => vi.useRealTimers());

const newChat = async (title = "Plans") =>
	(await send("chat.create", { title })).id;

describe("chats", () => {
	it("open with their latest messages, saying whether earlier ones exist", async () => {
		const chatId = await newChat();
		for (let turn = 1; turn <= 12; turn++) {
			await send("chat.addMessage", {
				chatId,
				message: { role: "user", text: `Turn ${turn}` },
			});
		}
		const keys = await unlockedKeys();
		const texts = (messages: Array<{ role: string }>) =>
			messages.map((message) =>
				message.role === "user"
					? (message as unknown as { text: string }).text
					: "",
			);
		const latest = await listLatestChatMessages(littleDB, keys, chatId, 5);
		expect(texts(latest.messages)).toEqual([
			"Turn 8",
			"Turn 9",
			"Turn 10",
			"Turn 11",
			"Turn 12",
		]);
		expect(latest.hasEarlier).toBe(true);
		const all = await listLatestChatMessages(littleDB, keys, chatId, 12);
		expect(all.messages).toHaveLength(12);
		expect(all.hasEarlier).toBe(false);
	});

	it("keep their messages in order, sealed, newest chat first", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(1_000);
		const first = await newChat("First");
		const second = await newChat("Second");
		// Two messages within one millisecond stay in the order sent.
		await send("chat.addMessage", {
			chatId: first,
			message: { role: "user", text: "Hello" },
		});
		await send("chat.addMessage", {
			chatId: first,
			message: {
				role: "assistant",
				output: { message: "Hi there", expression: "smiling" },
			},
		});
		const keys = await unlockedKeys();
		expect(
			(await listChatMessages(littleDB, keys, first)).map((message) =>
				message.role === "user" ? message.text : message.output.message,
			),
		).toEqual(["Hello", "Hi there"]);
		// The chat with the newest message comes first.
		expect(
			(await listChats(littleDB, keys)).map((chat) => chat.title),
		).toEqual(["First", "Second"]);
		expect(second).toBeTruthy();
		// Nothing readable is stored in the clear.
		const stored = JSON.stringify(await littleDB.chatMessages.toArray());
		expect(stored).not.toContain("Hello");
		expect(JSON.stringify(await littleDB.chats.toArray())).not.toContain(
			"First",
		);
	});

	it("rename, and delete with their messages", async () => {
		const id = await newChat();
		await send("chat.addMessage", {
			chatId: id,
			message: { role: "user", text: "Hello" },
		});
		await send("chat.rename", { id, title: "Trip" });
		const keys = await unlockedKeys();
		expect((await listChats(littleDB, keys))[0].title).toBe("Trip");
		await send("chat.delete", { id });
		expect(await littleDB.chats.count()).toBe(0);
		expect(await littleDB.chatMessages.count()).toBe(0);
	});

	it("refuse bad input and another profile's chat", async () => {
		const id = await newChat();
		await expect(send("chat.create", { title: "  " })).rejects.toThrow(
			/title/,
		);
		await expect(
			send("chat.addMessage", {
				chatId: id,
				message: { role: "system", text: "x" } as never,
			}),
		).rejects.toThrow(/role/);
		await send("profile.create", { name: "Bea", password: null });
		await expect(
			send("chat.rename", { id, title: "Mine" }),
		).rejects.toThrow(/not found/);
		await expect(
			send("chat.addMessage", {
				chatId: id,
				message: { role: "user", text: "Hi" },
			}),
		).rejects.toThrow(/not found/);
	});

	it("go when their profile is deleted", async () => {
		const id = await newChat();
		await send("chat.addMessage", {
			chatId: id,
			message: { role: "user", text: "Hello" },
		});
		const { profileId } = await unlockedKeys();
		await send("profile.delete", { profileId, password: null });
		expect(await littleDB.chats.count()).toBe(0);
		expect(await littleDB.chatMessages.count()).toBe(0);
	});
});

describe("truncating a chat", () => {
	it("removes a message and everything after it", async () => {
		const chatId = (await send("chat.create", { title: "Edits" })).id;
		const ids: Array<string> = [];
		for (const text of ["one", "two", "three"]) {
			ids.push(
				(
					await send("chat.addMessage", {
						chatId,
						message: { role: "user", text },
					})
				).id,
			);
		}
		await send("chat.truncate", { chatId, fromId: ids[1] });
		const keys = await unlockedKeys();
		expect(
			(await listChatMessages(littleDB, keys, chatId)).map((message) =>
				message.role === "user" ? message.text : "",
			),
		).toEqual(["one"]);
		await expect(
			send("chat.truncate", { chatId, fromId: "nope" }),
		).rejects.toThrow(/not found/);
	});
});
