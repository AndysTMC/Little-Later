import Dexie from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { useContext, useEffect, useRef, useState } from "react";
import { openBody, type ProfileKeys } from "../../storage/keys";
import { littleDB } from "../../storage/pageDB";
import {
	toNote,
	toReminder,
	toSave,
	toTask,
	type Note,
	type NoteContent,
	type Reminder,
	type ReminderContent,
	type Save,
	type SaveContent,
	type Task,
	type TaskContent,
} from "../../storage/repositories";
import type {
	LinkRow,
	NoteRow,
	ReminderRow,
	SaveRow,
	TaskRow,
} from "../../storage/schema";
import { RecordsContext, type Records } from "../contexts/RecordsContext";

// Live, decrypted lists of the unlocked profile's records (decision 0012,
// Reads). A live query reads the rows; their bodies are opened outside it,
// since a live query may only await the database. An opened body is kept
// until its row is sealed again, which picks a fresh IV: so a list that
// changes reopens only the rows that changed.
//
// The lists are read once, by the records provider above the routes, and
// every page shares them. While changed rows are being reopened the last
// opened list stays in place: a background write (the worker capturing a
// page, a reminder firing) must never blank a list, because the pages
// that render it would unmount and lose what the user was doing.

type SealedRow = { id: string; body: Uint8Array };
type Table = "saves" | "notes" | "tasks" | "reminders";

// The envelope's IV (decision 0010, Envelope): bytes 5 to 16.
const sealVersion = (row: SealedRow) =>
	`${row.id}:${Array.from(row.body.subarray(5, 17)).join(",")}`;

const owned = (profileId: string) =>
	[
		[profileId, Dexie.minKey],
		[profileId, Dexie.maxKey],
	] as const;

const useOpened = <R extends SealedRow, C, T>(
	keys: ProfileKeys | null | undefined,
	table: Table,
	rows: Array<R> | undefined,
	build: (row: R, content: C) => T,
): Array<T> | undefined => {
	const cache = useRef(new Map<string, C>());
	const [opened, setOpened] = useState<{
		profileId: string;
		records: Array<T>;
	} | null>(null);

	useEffect(() => {
		if (!keys) {
			// Locked: nothing decrypted stays behind (0010, Locking).
			cache.current = new Map();
			setOpened(null);
			return;
		}
		if (!rows) return;
		let active = true;
		void (async () => {
			const next = new Map<string, C>();
			const records: Array<T> = [];
			for (const row of rows) {
				const version = sealVersion(row);
				let content = cache.current.get(version);
				if (content === undefined) {
					try {
						content = await openBody<C>(
							keys,
							table,
							row.id,
							row.body,
						);
					} catch (error) {
						// One row that cannot be opened must not hide the
						// rest of the profile.
						console.warn(
							`Skipping an unreadable row in ${table}: ${row.id}`,
							error,
						);
						continue;
					}
				}
				next.set(version, content);
				records.push(build(row, content));
			}
			if (!active) return;
			cache.current = next;
			setOpened({ profileId: keys.profileId, records });
		})();
		return () => {
			active = false;
		};
	}, [keys, table, rows, build]);

	if (!keys) return undefined;
	// Records of another profile are never shown; the same profile's last
	// list stays until the changed rows are opened.
	return opened?.profileId === keys.profileId ? opened.records : undefined;
};

const useRows = <R>(
	keys: ProfileKeys | null | undefined,
	query: (profileId: string) => Promise<Array<R>>,
): Array<R> | undefined => {
	const profileId = keys?.profileId;
	return useLiveQuery(
		() => (profileId === undefined ? undefined : query(profileId)),
		[profileId],
		undefined,
	);
};

// What the records provider reads. Pages use the hooks below instead.
export const useRecordsSource = (
	keys: ProfileKeys | null | undefined,
): Records => {
	const saveRows = useRows<SaveRow>(keys, async (profileId) =>
		(
			await littleDB.saves
				.where("[profileId+keyId]")
				.between(...owned(profileId))
				.toArray()
		).sort((a, b) => b.browsedAt - a.browsedAt),
	);
	const noteRows = useRows<NoteRow>(keys, (profileId) =>
		littleDB.notes
			.where("[profileId+updatedAt]")
			.between(...owned(profileId))
			.reverse()
			.toArray(),
	);
	const taskRows = useRows<TaskRow>(keys, async (profileId) =>
		(
			await littleDB.tasks
				.where("[profileId+keyId]")
				.between(...owned(profileId))
				.toArray()
		).sort(
			(a, b) =>
				(a.dueAt === 0 ? Infinity : a.dueAt) -
				(b.dueAt === 0 ? Infinity : b.dueAt),
		),
	);
	const reminderRows = useRows<ReminderRow>(keys, async (profileId) =>
		(
			await littleDB.reminders
				.where("[profileId+keyId]")
				.between(...owned(profileId))
				.toArray()
		).sort((a, b) => a.target - b.target),
	);
	const links = useRows<LinkRow>(keys, (profileId) =>
		littleDB.links
			.where("[profileId+fromId]")
			.between(...owned(profileId))
			.toArray(),
	);
	return {
		saves: useOpened<SaveRow, SaveContent, Save>(
			keys,
			"saves",
			saveRows,
			toSave,
		),
		notes: useOpened<NoteRow, NoteContent, Note>(
			keys,
			"notes",
			noteRows,
			toNote,
		),
		tasks: useOpened<TaskRow, TaskContent, Task>(
			keys,
			"tasks",
			taskRows,
			toTask,
		),
		reminders: useOpened<ReminderRow, ReminderContent, Reminder>(
			keys,
			"reminders",
			reminderRows,
			toReminder,
		),
		links: keys ? links : undefined,
	};
};

// Every save, saved or only browsed, most recent visit first.
export const useSaves = (): Array<Save> | undefined =>
	useContext(RecordsContext).saves;

// Most recently changed first.
export const useNotes = (): Array<Note> | undefined =>
	useContext(RecordsContext).notes;

// Open and finished tasks, soonest deadline first, undated last.
export const useTasks = (): Array<Task> | undefined =>
	useContext(RecordsContext).tasks;

// Every reminder, soonest target first, including those that have fired.
export const useReminders = (): Array<Reminder> | undefined =>
	useContext(RecordsContext).reminders;

// Links are plain: ids only (decision 0010).
export const useLinks = (): Array<LinkRow> | undefined =>
	useContext(RecordsContext).links;
