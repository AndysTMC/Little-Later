import Dexie from "dexie";
import { LINITIAL_USER_SETTINGS } from "little-shared/constants";
import type { LUserSettings } from "little-shared/types";
import { openBody, type ProfileKeys } from "./keys";
import type {
	LittleDB,
	NoteRow,
	ReminderRow,
	SaveRow,
	TaskRow,
} from "./schema";

// Decrypting reads (decision 0012, Reads). Any context holding the profile's
// keys can use these; writes go through worker commands.

// What a save's sealed body holds.
export type SaveContent = { url: string; title: string; customName: string };
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

export const openSave = async (
	keys: ProfileKeys,
	row: SaveRow,
): Promise<Save> => ({
	...(await openBody<SaveContent>(keys, "saves", row.id, row.body)),
	id: row.id,
	saved: row.saved === 1,
	browsed: row.browsed === 1,
	browsedAt: row.browsedAt,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});

export const openNote = async (
	keys: ProfileKeys,
	row: NoteRow,
): Promise<Note> => ({
	...(await openBody<NoteContent>(keys, "notes", row.id, row.body)),
	id: row.id,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});

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
	return Promise.all(rows.map((row) => openSave(keys, row)));
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
	return Promise.all(rows.map((row) => openNote(keys, row)));
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
	return Promise.all(
		rows
			.filter((row): row is NoteRow => row !== undefined)
			.map((row) => openNote(keys, row)),
	);
};

export const getSettings = async (
	db: LittleDB,
	keys: ProfileKeys,
): Promise<LUserSettings> => {
	const row = await db.settings.get(keys.profileId);
	return row
		? openBody<LUserSettings>(keys, "settings", row.id, row.body)
		: LINITIAL_USER_SETTINGS.value;
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

export const openTask = async (
	keys: ProfileKeys,
	row: TaskRow,
): Promise<Task> => ({
	...(await openBody<TaskContent>(keys, "tasks", row.id, row.body)),
	id: row.id,
	schedule: row.schedule,
	dueAt: row.dueAt,
	finishedAt: row.finishedAt,
	done: row.done === 1,
});

export const openReminder = async (
	keys: ProfileKeys,
	row: ReminderRow,
): Promise<Reminder> => ({
	...(await openBody<ReminderContent>(keys, "reminders", row.id, row.body)),
	id: row.id,
	target: row.target,
	escalation: row.escalation,
	lastFiredAt: row.lastFiredAt,
	nextFireAt: row.nextFireAt,
});

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
	return Promise.all(ordered.map((row) => openTask(keys, row)));
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
	return Promise.all(rows.map((row) => openReminder(keys, row)));
};
