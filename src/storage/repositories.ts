import Dexie from "dexie";
import { LINITIAL_USER_SETTINGS } from "little-shared/constants";
import type { LUserSettings } from "little-shared/types";
import { openAsset, openBody, sealAsset, type ProfileKeys } from "./keys";
import type { LAIConfirmation } from "little-shared/types";
import type {
	ChatMessageRow,
	ChatRow,
	ImageRow,
	LittleDB,
	NoteRow,
	ReminderRow,
	SaveRow,
	TaskRow,
} from "./schema";

// Decrypting reads (decision 0012, Reads). Any context holding the profile's
// keys can use these; writes go through worker commands.

// Opens each row of a list. A row that cannot be opened (damaged, or sealed
// under a key this profile no longer has) is skipped and reported, so one
// bad record does not hide the rest; the popup's lists do the same.
export const openEach = async <R extends { id: string }, T>(
	table: string,
	rows: ReadonlyArray<R>,
	open: (row: R) => Promise<T>,
): Promise<Array<T>> => {
	const opened: Array<T> = [];
	for (const row of rows) {
		try {
			opened.push(await open(row));
		} catch (error) {
			console.warn(
				`Skipping an unreadable row in ${table}: ${row.id}`,
				error,
			);
		}
	}
	return opened;
};

import { normalizeTags } from "../utils/tags";

// What a save's sealed body holds. `provisional` marks a name that only
// stands in for a title the page did not have yet (its host name); the
// first real title replaces it. A name the user gives is never provisional.
export type SaveContent = {
	url: string;
	title: string;
	customName: string;
	provisional?: true;
	archived?: boolean;
	tags?: Array<string>;
};
export type NoteContent = {
	content: string;
	locked?: boolean;
	title?: string;
	tags?: Array<string>;
};

export type Save = SaveContent & {
	id: string;
	saved: boolean;
	browsed: boolean;
	browsedAt: number;
	createdAt: number;
	updatedAt: number;
};

export type Note = NoteContent & {
	id: string;
	createdAt: number;
	updatedAt: number;
};

// Builders join a row's plain fields with its opened body. Optional fields
// (`archived`, `locked`, `title`, `tags`) are included only when set, matching
// `provisional` and preserving exact backward compatibility with format v1–3
// records and golden backups.
export const toSave = (row: SaveRow, content: SaveContent): Save => {
	const tags = normalizeTags(content.tags);
	return {
		...content,
		...(content.archived ? { archived: true } : {}),
		...(tags.length > 0 ? { tags } : {}),
		id: row.id,
		saved: row.saved === 1,
		browsed: row.browsed === 1,
		browsedAt: row.browsedAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
};

export const toNote = (row: NoteRow, content: NoteContent): Note => {
	const tags = normalizeTags(content.tags);
	const title = typeof content.title === "string" ? content.title.trim() : "";
	return {
		...content,
		...(content.locked ? { locked: true } : {}),
		...(title !== "" ? { title } : {}),
		...(tags.length > 0 ? { tags } : {}),
		id: row.id,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
};

export const openSave = async (
	keys: ProfileKeys,
	row: SaveRow,
): Promise<Save> =>
	toSave(row, await openBody<SaveContent>(keys, "saves", row.id, row.body));

export const openNote = async (
	keys: ProfileKeys,
	row: NoteRow,
): Promise<Note> =>
	toNote(row, await openBody<NoteContent>(keys, "notes", row.id, row.body));

const ownedBy = (profileId: string) =>
	[
		[profileId, Dexie.minKey],
		[profileId, Dexie.maxKey],
	] as const;

// Saved pages, newest visit first; or browsing history (unsaved pages).
export const listSaves = async (
	db: LittleDB,
	keys: ProfileKeys,
	saved: boolean,
): Promise<Array<Save>> => {
	const rows = await db.saves
		.where("[profileId+saved+browsedAt]")
		.between(
			[keys.profileId, saved ? 1 : 0, Dexie.minKey],
			[keys.profileId, saved ? 1 : 0, Dexie.maxKey],
		)
		.reverse()
		.toArray();
	return openEach("saves", rows, (row) => openSave(keys, row));
};

// The most recently visited pages, newest first. Only that many are opened:
// the visit index is walked from the newest, so a long history costs no
// more than a short one.
export const listRecentHistory = async (
	db: LittleDB,
	keys: ProfileKeys,
	limit: number,
): Promise<Array<Save>> => {
	const opened: Array<Save> = [];
	let offset = 0;
	while (opened.length < limit) {
		const rows = await db.saves
			.where("[profileId+browsed+browsedAt]")
			.between(
				[keys.profileId, 1, Dexie.minKey],
				[keys.profileId, 1, Dexie.maxKey],
			)
			.reverse()
			.offset(offset)
			.limit(limit - opened.length)
			.toArray();
		if (rows.length === 0) break;
		offset += rows.length;
		// An unreadable row is skipped, and the next one read in its place.
		opened.push(
			...(await openEach("saves", rows, (row) => openSave(keys, row))),
		);
	}
	return opened;
};

// A save's page preview: a sealed JPEG asset the worker captures (0010).
export const PREVIEW_KIND = "preview";
export const PREVIEW_TYPE = "image/jpeg";

// Replaces a save's preview. False when the save is gone or not the
// profile's, as when it was deleted after the capture began.
export const putPreview = async (
	db: LittleDB,
	keys: ProfileKeys,
	saveId: string,
	bytes: Uint8Array,
	now: number,
): Promise<boolean> => {
	const id = crypto.randomUUID();
	const sealed = await sealAsset(keys, id, bytes);
	return db.transaction("rw", [db.saves, db.assets], async () => {
		const save = await db.saves.get(saveId);
		if (!save || save.profileId !== keys.profileId) {
			return false;
		}
		await db.assets
			.where("[profileId+ownerId]")
			.equals([keys.profileId, saveId])
			.filter((asset) => asset.kind === PREVIEW_KIND)
			.delete();
		await db.assets.add({
			id,
			profileId: keys.profileId,
			...sealed,
			createdAt: now,
			updatedAt: now,
			ownerId: saveId,
			kind: PREVIEW_KIND,
		});
		return true;
	});
};

export const getSave = async (
	db: LittleDB,
	keys: ProfileKeys,
	id: string,
): Promise<Save | undefined> => {
	const row = await db.saves.get(id);
	return row && row.profileId === keys.profileId
		? openSave(keys, row)
		: undefined;
};

export const listNotes = async (
	db: LittleDB,
	keys: ProfileKeys,
): Promise<Array<Note>> => {
	const [from, to] = ownedBy(keys.profileId);
	const rows = await db.notes
		.where("[profileId+updatedAt]")
		.between(from, to)
		.reverse()
		.toArray();
	return openEach("notes", rows, (row) => openNote(keys, row));
};

// Notes linked to a record, such as a save.
export const listNotesFor = async (
	db: LittleDB,
	keys: ProfileKeys,
	recordId: string,
): Promise<Array<Note>> => {
	const links = await db.links
		.where("[profileId+toId]")
		.equals([keys.profileId, recordId])
		.toArray();
	const rows = await db.notes.bulkGet(links.map((link) => link.fromId));
	return openEach(
		"notes",
		rows.filter((row): row is NoteRow => row !== undefined),
		(row) => openNote(keys, row),
	);
};

export const IMAGE_KIND = "image";

export type ImageContent = {
	title: string;
	mimeType: string;
	sourceUrl?: string;
	tags?: Array<string>;
};

export type ImageRecord = ImageContent & {
	id: string;
	createdAt: number;
	updatedAt: number;
};

export const toImage = (row: ImageRow, content: ImageContent): ImageRecord => {
	const tags = normalizeTags(content.tags);
	const sourceUrl =
		typeof content.sourceUrl === "string" && content.sourceUrl.trim() !== ""
			? content.sourceUrl.trim()
			: undefined;
	return {
		title: content.title,
		mimeType: content.mimeType,
		...(sourceUrl ? { sourceUrl } : {}),
		...(tags.length > 0 ? { tags } : {}),
		id: row.id,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
};

export const openImage = async (
	keys: ProfileKeys,
	row: ImageRow,
): Promise<ImageRecord> =>
	toImage(
		row,
		await openBody<ImageContent>(keys, "images", row.id, row.body),
	);

export const listImages = async (
	db: LittleDB,
	keys: ProfileKeys,
): Promise<Array<ImageRecord>> => {
	const [from, to] = ownedBy(keys.profileId);
	const rows = await db.images
		.where("[profileId+updatedAt]")
		.between(from, to)
		.reverse()
		.toArray();
	return openEach("images", rows, (row) => openImage(keys, row));
};

export const getImageBlob = async (
	db: LittleDB,
	keys: ProfileKeys,
	imageId: string,
	mimeType: string,
): Promise<Blob | undefined> => {
	const row = await db.assets
		.where("[profileId+ownerId]")
		.equals([keys.profileId, imageId])
		.filter((asset) => asset.kind === IMAGE_KIND)
		.first();
	if (!row) {
		return undefined;
	}
	const bytes = await openAsset(keys, row.id, row.body);
	return new Blob([bytes.slice()], { type: mimeType });
};

// A profile's sealed settings: the AI provider with its key, and the
// history limits. The first-run guide is not per profile and stays out.
export type Settings = Pick<LUserSettings, "ai" | "misc">;

export const defaultSettings = (): Settings => {
	const { ai, misc } = LINITIAL_USER_SETTINGS.value;
	return { ai, misc };
};

export const getSettings = async (
	db: LittleDB,
	keys: ProfileKeys,
): Promise<Settings> => {
	const row = await db.settings.get(keys.profileId);
	return row
		? openBody<Settings>(keys, "settings", row.id, row.body)
		: defaultSettings();
};

export type TaskPriority = "low" | "medium" | "high";
export type TaskContent = {
	information: string;
	label: string;
	priority: TaskPriority;
	tags?: Array<string>;
};
export type ReminderContent = { message: string; tags?: Array<string> };

export type Task = TaskContent &
	Pick<TaskRow, "id" | "schedule" | "dueAt" | "finishedAt"> & {
		done: boolean;
	};

export type Reminder = ReminderContent &
	Pick<
		ReminderRow,
		"id" | "target" | "escalation" | "lastFiredAt" | "nextFireAt"
	>;

export const toTask = (row: TaskRow, content: TaskContent): Task => {
	const tags = normalizeTags(content.tags);
	return {
		...content,
		...(tags.length > 0 ? { tags } : {}),
		id: row.id,
		schedule: row.schedule,
		dueAt: row.dueAt,
		finishedAt: row.finishedAt,
		done: row.done === 1,
	};
};

export const toReminder = (
	row: ReminderRow,
	content: ReminderContent,
): Reminder => {
	const tags = normalizeTags(content.tags);
	return {
		...content,
		...(tags.length > 0 ? { tags } : {}),
		id: row.id,
		target: row.target,
		escalation: row.escalation,
		lastFiredAt: row.lastFiredAt,
		nextFireAt: row.nextFireAt,
	};
};

export const openTask = async (
	keys: ProfileKeys,
	row: TaskRow,
): Promise<Task> =>
	toTask(row, await openBody<TaskContent>(keys, "tasks", row.id, row.body));

export const openReminder = async (
	keys: ProfileKeys,
	row: ReminderRow,
): Promise<Reminder> =>
	toReminder(
		row,
		await openBody<ReminderContent>(keys, "reminders", row.id, row.body),
	);

// Open or finished tasks, soonest deadline first; tasks without one last.
export const listTasks = async (
	db: LittleDB,
	keys: ProfileKeys,
	done = false,
): Promise<Array<Task>> => {
	const rows = await db.tasks
		.where("[profileId+done+dueAt]")
		.between(
			[keys.profileId, done ? 1 : 0, Dexie.minKey],
			[keys.profileId, done ? 1 : 0, Dexie.maxKey],
		)
		.toArray();
	const ordered = [
		...rows.filter((row) => row.dueAt !== 0),
		...rows.filter((row) => row.dueAt === 0),
	];
	return openEach("tasks", ordered, (row) => openTask(keys, row));
};

// Reminders that will still fire, soonest first.
export const listReminders = async (
	db: LittleDB,
	keys: ProfileKeys,
): Promise<Array<Reminder>> => {
	const rows = await db.reminders
		.where("[profileId+nextFireAt]")
		.between([keys.profileId, 1], [keys.profileId, Dexie.maxKey])
		.toArray();
	return openEach("reminders", rows, (row) => openReminder(keys, row));
};

// LittleAI's chats (decision 0017).

// `named`: the user chose the title; otherwise it follows the first
// message, also when that message is edited.
export type ChatContent = { title: string; named?: true };

// What LittleAI answered, as stored: its text, the records it found and,
// while it waits, what it asks the user to confirm. Plain data only.
export type StoredAIOutput = {
	message: string;
	expression: string;
	confirmation?: LAIConfirmation;
	// The change this answer made, which Undo reverts until `until`.
	undo?: { label: string; until: number };
	// A question for the user, with options to choose from.
	question?: {
		question: string;
		options: Array<string>;
		allowOther: boolean;
	};
	// What LittleAI did to answer: "Searched notes", "Read your history".
	steps?: Array<string>;
	content?: {
		saves: Array<Save>;
		reminders: Array<Reminder>;
		tasks: Array<Task>;
		notes: Array<Note>;
	};
};

// How long a chat message's text may be, written or restored from a
// backup: what you send, and what LittleAI answers (a run shortens a
// longer answer to fit).
export const MAX_CHAT_TEXT = 100_000;
export const MAX_ANSWER_TEXT = 1_000_000;

export type ChatMessageContent =
	// `page`: the page attached to the message; its text isn't kept.
	| { role: "user"; text: string; page?: { title: string; url: string } }
	| { role: "assistant"; output: StoredAIOutput };

export type Chat = ChatContent & {
	id: string;
	createdAt: number;
	updatedAt: number;
};

export type ChatMessage = ChatMessageContent & {
	id: string;
	chatId: string;
	createdAt: number;
};

export const openChat = async (
	keys: ProfileKeys,
	row: ChatRow,
): Promise<Chat> => ({
	...(await openBody<ChatContent>(keys, "chats", row.id, row.body)),
	id: row.id,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});

export const openChatMessage = async (
	keys: ProfileKeys,
	row: ChatMessageRow,
): Promise<ChatMessage> => ({
	...(await openBody<ChatMessageContent>(
		keys,
		"chatMessages",
		row.id,
		row.body,
	)),
	id: row.id,
	chatId: row.chatId,
	createdAt: row.createdAt,
});

// The profile's chats, most recently active first.
export const listChats = async (
	db: LittleDB,
	keys: ProfileKeys,
): Promise<Array<Chat>> => {
	const [from, to] = ownedBy(keys.profileId);
	const rows = await db.chats
		.where("[profileId+updatedAt]")
		.between(from, to)
		.reverse()
		.toArray();
	return openEach("chats", rows, (row) => openChat(keys, row));
};

// A chat's messages, oldest first. Only the profile's own.
export const listChatMessages = async (
	db: LittleDB,
	keys: ProfileKeys,
	chatId: string,
): Promise<Array<ChatMessage>> => {
	const rows = await db.chatMessages
		.where("[chatId+createdAt]")
		.between([chatId, Dexie.minKey], [chatId, Dexie.maxKey])
		.filter((row) => row.profileId === keys.profileId)
		.toArray();
	return openEach("chatMessages", rows, (row) => openChatMessage(keys, row));
};

// A chat's latest `count` messages, oldest first, and whether earlier ones
// exist: a long chat opens without reading and opening all of it.
export const listLatestChatMessages = async (
	db: LittleDB,
	keys: ProfileKeys,
	chatId: string,
	count: number,
): Promise<{ messages: Array<ChatMessage>; hasEarlier: boolean }> => {
	const rows = await db.chatMessages
		.where("[chatId+createdAt]")
		.between([chatId, Dexie.minKey], [chatId, Dexie.maxKey])
		.reverse()
		.filter((row) => row.profileId === keys.profileId)
		.limit(count + 1)
		.toArray();
	const latest = rows.slice(0, count).reverse();
	return {
		messages: await openEach("chatMessages", latest, (row) =>
			openChatMessage(keys, row),
		),
		hasEarlier: rows.length > count,
	};
};
