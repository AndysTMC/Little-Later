import Dexie from "dexie";
import type { ProfileKeys } from "../storage/keys";
import { getSettings } from "../storage/repositories";
import type { LittleDB } from "../storage/schema";

const DAY_MS = 86_400_000;

// Enforces the profile's AI chat history retention policy:
//   0  -> keep forever
//   -1 -> clear all chats when locking
//   >0 -> delete chats older than N days
export const enforceChatRetention = async (
	db: LittleDB,
	keys: ProfileKeys,
	options: { onLock?: boolean; now?: number } = {},
): Promise<number> => {
	const { misc } = await getSettings(db, keys);
	const retention = misc.chatRetentionDays ?? 0;
	if (retention === 0) {
		return 0;
	}
	const onLock = options.onLock ?? false;
	if (retention === -1 && !onLock) {
		return 0;
	}
	const cutoff =
		retention === -1
			? Number.POSITIVE_INFINITY
			: (options.now ?? Date.now()) - retention * DAY_MS;

	const chats = await db.chats
		.where("[profileId+updatedAt]")
		.between([keys.profileId, Dexie.minKey], [keys.profileId, Dexie.maxKey])
		.toArray();
	const toRemove = chats
		.filter((chat) => chat.updatedAt < cutoff)
		.map((chat) => chat.id);
	if (toRemove.length === 0) {
		return 0;
	}
	await db.transaction("rw", [db.chats, db.chatMessages], async () => {
		for (const chatId of toRemove) {
			await db.chatMessages
				.where("[chatId+createdAt]")
				.between([chatId, Dexie.minKey], [chatId, Dexie.maxKey])
				.delete();
		}
		await db.chats.bulkDelete(toRemove);
	});
	return toRemove.length;
};
