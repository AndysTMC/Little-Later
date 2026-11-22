import { ownerOf, type AIOwner } from "../../services/ai/owner";
import * as runs from "../../services/ai/runs";
import { isReadablePage, type PageRef } from "../../services/ai/pages";
import { MAX_CHAT_TEXT } from "../../storage/repositories";
import {
	addChatMessage,
	createChat,
	messageInChat,
	retitleEmptyChat,
	titleFrom,
} from "./chats";
import {
	CommandError,
	type CommandContext,
	asNullableString,
	asRecord,
	asString,
	defineCommand,
	fail,
} from "./registry";

// LittleAI's runs, started from the side panel (decision 0017). Each command
// starts work and returns at once: a run takes as long as the provider,
// and holding the write queue that long would stop every other write. The
// run then writes its answer through the queue like any other command.

const asText = (value: unknown): string => {
	const text = asString(value, "text");
	return text.trim() !== "" && text.length <= MAX_CHAT_TEXT
		? text
		: fail(`text must be 1 to ${MAX_CHAT_TEXT} characters.`);
};

// The page attached to a message: which tab, and what it's called.
const asPage = (value: unknown): PageRef | undefined => {
	if (value === undefined || value === null) return undefined;
	const record = asRecord(value);
	const tabId = record.tabId;
	const url = asString(record.url, "url");
	if (!Number.isInteger(tabId) || !isReadablePage(url)) {
		return fail("page must name an open web page's tab.");
	}
	return {
		tabId: tabId as number,
		url,
		title: asString(record.title, "title").slice(0, 300),
	};
};

// The unlock the run belongs to, and the chat, which must be the
// profile's own.
const ownChat = async (
	ctx: CommandContext,
	chatId: string,
): Promise<AIOwner> => {
	const keys = await ctx.keys();
	const chat = await ctx.db.chats.get(chatId);
	if (!chat || chat.profileId !== keys.profileId) {
		throw new CommandError("rejected", "Chat not found.");
	}
	const session = await ctx.session.get();
	if (!session) {
		throw new CommandError("locked", "No profile is unlocked.");
	}
	return ownerOf(session);
};

// Sends a message: to a new chat (chatId null), titled from it, or to an
// existing one. The answer arrives as the chat's next message. With
// `replaceFromId` it is an edit: that message and what followed are
// replaced by this one, in the same step, once the new one is valid.
export const aiSend = defineCommand({
	name: "ai.send",
	parse: (input) => {
		const record = asRecord(input);
		const chatId = asNullableString(record.chatId ?? null, "chatId");
		const replaceFromId =
			asNullableString(record.replaceFromId ?? null, "replaceFromId") ??
			undefined;
		if (replaceFromId !== undefined && chatId === null) {
			fail("replaceFromId needs the chat it is in.");
		}
		return {
			chatId,
			replaceFromId,
			text: asText(record.text),
			page: asPage(record.page),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		if (input.chatId !== null && runs.isRunning(input.chatId)) {
			throw new CommandError(
				"rejected",
				"LittleAI is still answering in this chat.",
			);
		}
		const chatId =
			input.chatId ??
			(await createChat(ctx, keys, titleFrom(input.text)));
		const owner = await ownChat(ctx, chatId);
		const replacing =
			input.replaceFromId !== undefined
				? await messageInChat(ctx, chatId, input.replaceFromId)
				: undefined;
		if (input.chatId !== null) {
			await retitleEmptyChat(ctx, keys, chatId, input.text, replacing);
		}
		await addChatMessage(
			ctx,
			keys,
			chatId,
			{
				role: "user",
				text: input.text,
				...(input.page
					? {
							page: {
								title: input.page.title,
								url: input.page.url,
							},
						}
					: {}),
			},
			replacing,
		);
		// The provider's view of an edited chat is rebuilt from what is left.
		if (replacing) runs.forget(chatId);
		runs.ask(chatId, owner, input.text, input.page ?? null);
		return { chatId };
	},
});

const asChatId = (input: unknown) => ({
	chatId: asString(asRecord(input).chatId, "chatId"),
});

// Carries out what LittleAI asked to confirm; an export needs a password.
export const aiConfirm = defineCommand({
	name: "ai.confirm",
	parse: (input) => {
		const record = asRecord(input);
		return {
			chatId: asString(record.chatId, "chatId"),
			password: asNullableString(record.password ?? null, "password"),
		};
	},
	run: async (ctx, input) => {
		runs.confirm(
			input.chatId,
			await ownChat(ctx, input.chatId),
			input.password,
		);
		return null;
	},
});

export const aiCancel = defineCommand({
	name: "ai.cancel",
	parse: asChatId,
	run: async (ctx, input) => {
		runs.cancel(input.chatId, await ownChat(ctx, input.chatId));
		return null;
	},
});

export const aiUndo = defineCommand({
	name: "ai.undo",
	parse: asChatId,
	run: async (ctx, input) => {
		runs.undo(input.chatId, await ownChat(ctx, input.chatId));
		return null;
	},
});

export const aiStop = defineCommand({
	name: "ai.stop",
	parse: asChatId,
	run: async (ctx, input) => {
		await ownChat(ctx, input.chatId);
		runs.stop(input.chatId);
		return null;
	},
});
