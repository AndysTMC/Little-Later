import Dexie from "dexie";
import type { LAIConfirmation, LAIConfirmationItem } from "little-shared/types";
import { forget as forgetChat, isRunning } from "../../services/ai/runs";
import { openBody, sealBody, type ProfileKeys } from "../../storage/keys";
import {
	MAX_ANSWER_TEXT,
	MAX_CHAT_TEXT,
	type ChatContent,
	type ChatMessageContent,
	type StoredAIOutput,
} from "../../storage/repositories";
import type { ChatMessageRow, ChatRow, LittleDB } from "../../storage/schema";
import {
	CommandError,
	type CommandContext,
	asBoolean,
	asRecord,
	asString,
	defineCommand,
	fail,
} from "./registry";

// LittleAI's chats (decision 0017). A chat is created by its first message
// and grows by one message at a time; LittleAI's runs add its answers
// through chat.addMessage like any other writer.

const MAX_TITLE_LENGTH = 120;
const MAX_SMALL_TEXT = 2_000;
const MAX_LIST_ITEMS = 100;
const CONFIRMATION_KINDS = new Set(["mutate", "destructive", "external"]);

export const asStoredAIOutput = (value: unknown): StoredAIOutput => {
	const output = asRecord(value);
	const message = asString(output.message, "message");
	if (message.length > MAX_ANSWER_TEXT) {
		fail(`message must be at most ${MAX_ANSWER_TEXT} characters.`);
	}
	const expression = asString(output.expression ?? "neutral", "expression");
	if (expression.length > 64) {
		fail("expression is too long.");
	}
	const sanitized: StoredAIOutput = { message, expression };
	if (output.steps !== undefined) {
		if (
			!Array.isArray(output.steps) ||
			output.steps.length > MAX_LIST_ITEMS
		) {
			return fail("steps must be a list of strings.");
		}
		sanitized.steps = output.steps.map((step) => {
			const s = asString(step, "step");
			return s.length <= MAX_SMALL_TEXT ? s : fail("step is too long.");
		});
	}
	if (output.confirmation !== undefined) {
		const conf = asRecord(output.confirmation);
		if (!Array.isArray(conf.items) || conf.items.length > MAX_LIST_ITEMS) {
			return fail("confirmation.items must be a list.");
		}
		const items: Array<LAIConfirmationItem> = conf.items.map((raw) => {
			const item = asRecord(raw);
			const toolName = asString(item.toolName, "toolName");
			const summary = asString(item.summary, "summary");
			const kind = asString(item.kind, "kind");
			if (
				toolName.length > 120 ||
				summary.length > MAX_SMALL_TEXT ||
				!CONFIRMATION_KINDS.has(kind)
			) {
				return fail("confirmation item is invalid.");
			}
			return {
				toolName,
				summary,
				kind: kind as LAIConfirmationItem["kind"],
			};
		});
		const confirmation: LAIConfirmation = {
			items,
			requiresPassword: asBoolean(
				conf.requiresPassword,
				"requiresPassword",
			),
		};
		sanitized.confirmation = confirmation;
	}
	if (output.undo !== undefined) {
		const undo = asRecord(output.undo);
		const label = asString(undo.label, "label");
		if (
			label.length > MAX_SMALL_TEXT ||
			typeof undo.until !== "number" ||
			!Number.isSafeInteger(undo.until) ||
			undo.until < 0
		) {
			return fail("undo is invalid.");
		}
		sanitized.undo = { label, until: undo.until };
	}
	if (output.question !== undefined) {
		const q = asRecord(output.question);
		const question = asString(q.question, "question");
		if (
			question.length > MAX_SMALL_TEXT ||
			!Array.isArray(q.options) ||
			q.options.length > MAX_LIST_ITEMS
		) {
			return fail("question is invalid.");
		}
		const options = q.options.map((opt) => {
			const s = asString(opt, "option");
			return s.length <= MAX_SMALL_TEXT
				? s
				: fail("question option is too long.");
		});
		sanitized.question = {
			question,
			options,
			allowOther: asBoolean(q.allowOther, "allowOther"),
		};
	}
	return sanitized;
};

const asTitle = (value: unknown): string => {
	const title = asString(value, "title").trim();
	return title !== "" && title.length <= MAX_TITLE_LENGTH
		? title
		: fail(`title must be 1 to ${MAX_TITLE_LENGTH} characters.`);
};

// A chat's title from its first message: its first line, shortened.
export const titleFrom = (text: string): string => {
	const line = text.trim().split("\n")[0].replace(/\s+/g, " ");
	return line.length <= 60 ? line || "New chat" : `${line.slice(0, 59)}…`;
};

const asMessage = (value: unknown): ChatMessageContent => {
	const record = asRecord(value);
	if (record.role === "user") {
		const text = asString(record.text, "text");
		return text.trim() !== "" && text.length <= MAX_CHAT_TEXT
			? { role: "user", text }
			: fail(`text must be 1 to ${MAX_CHAT_TEXT} characters.`);
	}
	if (record.role === "assistant") {
		return { role: "assistant", output: asStoredAIOutput(record.output) };
	}
	return fail("role must be user or assistant.");
};

const getOwnChat = async (
	db: LittleDB,
	keys: ProfileKeys,
	id: string,
): Promise<ChatRow> => {
	const row = await db.chats.get(id);
	if (!row || row.profileId !== keys.profileId) {
		throw new CommandError("rejected", "Chat not found.");
	}
	return row;
};

// Writers shared by the chat commands and ai.send, which writes the user's
// message itself: it runs inside the write queue, where waiting on another
// command would wait on itself.
export const createChat = async (
	ctx: CommandContext,
	keys: ProfileKeys,
	title: string,
): Promise<string> => {
	const id = crypto.randomUUID();
	const now = ctx.now();
	const sealed = await sealBody<ChatContent>(keys, "chats", id, { title });
	await ctx.db.chats.add({
		id,
		profileId: keys.profileId,
		...sealed,
		createdAt: now,
		updatedAt: now,
	});
	return id;
};

// A message of the chat, for editing from it.
export const messageInChat = async (
	ctx: CommandContext,
	chatId: string,
	id: string,
): Promise<ChatMessageRow> => {
	const message = await ctx.db.chatMessages.get(id);
	if (!message || message.chatId !== chatId) {
		throw new CommandError("rejected", "Message not found.");
	}
	return message;
};

// Adds a message to a chat and moves the chat to the top of the history.
// Messages keep their order even when two arrive within one millisecond.
// `replacing` a message removes it and what followed in the same
// transaction, so an edit either happens whole or not at all.
export const addChatMessage = async (
	ctx: CommandContext,
	keys: ProfileKeys,
	chatId: string,
	message: ChatMessageContent,
	replacing?: ChatMessageRow,
): Promise<string> => {
	const chat = await getOwnChat(ctx.db, keys, chatId);
	const id = crypto.randomUUID();
	const sealed = await sealBody<ChatMessageContent>(
		keys,
		"chatMessages",
		id,
		message,
	);
	await ctx.db.transaction(
		"rw",
		[ctx.db.chats, ctx.db.chatMessages],
		async () => {
			if (replacing) {
				await ctx.db.chatMessages
					.where("[chatId+createdAt]")
					.between(
						[chat.id, replacing.createdAt],
						[chat.id, Dexie.maxKey],
					)
					.delete();
			}
			const last = await ctx.db.chatMessages
				.where("[chatId+createdAt]")
				.between([chat.id, Dexie.minKey], [chat.id, Dexie.maxKey])
				.last();
			const createdAt = Math.max(ctx.now(), (last?.createdAt ?? 0) + 1);
			await ctx.db.chatMessages.add({
				id,
				profileId: keys.profileId,
				chatId: chat.id,
				...sealed,
				createdAt,
				updatedAt: createdAt,
			});
			await ctx.db.chats.update(chat.id, { updatedAt: createdAt });
		},
	);
	return id;
};

export const chatCreate = defineCommand({
	name: "chat.create",
	parse: (input) => ({ title: asTitle(asRecord(input).title) }),
	run: async (ctx, input) => ({
		id: await createChat(ctx, await ctx.keys(), input.title),
	}),
});

export const chatRename = defineCommand({
	name: "chat.rename",
	parse: (input) => {
		const record = asRecord(input);
		return { id: asString(record.id, "id"), title: asTitle(record.title) };
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await getOwnChat(ctx.db, keys, input.id);
		const sealed = await sealBody<ChatContent>(keys, "chats", row.id, {
			title: input.title,
			named: true,
		});
		await ctx.db.chats.put({ ...row, ...sealed });
		return null;
	},
});

export const chatDelete = defineCommand({
	name: "chat.delete",
	parse: (input) => ({ id: asString(asRecord(input).id, "id") }),
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await getOwnChat(ctx.db, keys, input.id);
		await ctx.db.transaction(
			"rw",
			[ctx.db.chats, ctx.db.chatMessages],
			async () => {
				await ctx.db.chatMessages
					.where("[chatId+createdAt]")
					.between([row.id, Dexie.minKey], [row.id, Dexie.maxKey])
					.delete();
				await ctx.db.chats.delete(row.id);
			},
		);
		// A run still answering in it stops, and its client goes.
		forgetChat(row.id);
		return null;
	},
});

export const chatAddMessage = defineCommand({
	name: "chat.addMessage",
	parse: (input) => {
		const record = asRecord(input);
		return {
			chatId: asString(record.chatId, "chatId"),
			message: asMessage(record.message),
		};
	},
	run: async (ctx, input) => ({
		id: await addChatMessage(
			ctx,
			await ctx.keys(),
			input.chatId,
			input.message,
		),
	}),
});

// Removes a message and everything after it: editing a message, or asking
// for another answer, starts the conversation again from there.
export const chatTruncate = defineCommand({
	name: "chat.truncate",
	parse: (input) => {
		const record = asRecord(input);
		return {
			chatId: asString(record.chatId, "chatId"),
			fromId: asString(record.fromId, "fromId"),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const chat = await getOwnChat(ctx.db, keys, input.chatId);
		if (isRunning(chat.id)) {
			throw new CommandError(
				"rejected",
				"LittleAI is still answering in this chat.",
			);
		}
		const from = await messageInChat(ctx, chat.id, input.fromId);
		await ctx.db.chatMessages
			.where("[chatId+createdAt]")
			.between([chat.id, from.createdAt], [chat.id, Dexie.maxKey])
			.delete();
		// The provider's view of the chat is rebuilt from what is left.
		forgetChat(chat.id);
		return null;
	},
});

// A chat whose first message is being written again (an edit of it, or
// after everything was taken away) takes its title from the new one,
// unless the user named it. `replacing` is the message being edited.
export const retitleEmptyChat = async (
	ctx: CommandContext,
	keys: ProfileKeys,
	chatId: string,
	text: string,
	replacing?: ChatMessageRow,
): Promise<void> => {
	const chat = await getOwnChat(ctx.db, keys, chatId);
	const count = await ctx.db.chatMessages
		.where("[chatId+createdAt]")
		.between(
			[chat.id, Dexie.minKey],
			[chat.id, replacing?.createdAt ?? Dexie.maxKey],
			true,
			false,
		)
		.count();
	if (count > 0) return;
	const content = await openBody<ChatContent>(
		keys,
		"chats",
		chat.id,
		chat.body,
	);
	if (content.named) return;
	const sealed = await sealBody<ChatContent>(keys, "chats", chat.id, {
		title: titleFrom(text),
	});
	await ctx.db.chats.put({ ...chat, ...sealed });
};
