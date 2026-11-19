import Dexie from "dexie";
import { LINITIAL_USER_SETTINGS } from "little-shared/constants";
import type { LUserSettings } from "little-shared/types";
import { openBody, sealAsset, type ProfileKeys } from "./keys";
import type {
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

// What a save's sealed body holds. `provisional` marks a name that only
// stands in for a title the page did not have yet (its host name); the
// first real title replaces it. A name the user gives is never provisional.
export type SaveContent = {
	url: string;
	title: string;
	customName: string;
	provisional?: true;
};
export type NoteContent = { content: string };

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

// Builders join a row's plain fields with its opened body. Pages that cache
// opened bodies use them directly.
export const toSave = (row: SaveRow, content: SaveContent): Save => ({
	...content,
	id: row.id,
	saved: row.saved === 1,
	browsed: row.browsed === 1,
	browsedAt: row.browsedAt,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});

export const toNote = (row: NoteRow, content: NoteContent): Note => ({
	...content,
	id: row.id,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});

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
};
export type ReminderContent = { message: string };

export type Task = TaskContent &
	Pick<TaskRow, "id" | "schedule" | "dueAt" | "finishedAt"> & {
		done: boolean;
	};

export type Reminder = ReminderContent &
	Pick<
		ReminderRow,
		"id" | "target" | "escalation" | "lastFiredAt" | "nextFireAt"
	>;

export const toTask = (row: TaskRow, content: TaskContent): Task => ({
	...content,
	id: row.id,
	schedule: row.schedule,
	dueAt: row.dueAt,
	finishedAt: row.finishedAt,
	done: row.done === 1,
});

export const toReminder = (
	row: ReminderRow,
	content: ReminderContent,
): Reminder => ({
	...content,
	id: row.id,
	target: row.target,
	escalation: row.escalation,
	lastFiredAt: row.lastFiredAt,
	nextFireAt: row.nextFireAt,
});

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
