import Dexie from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useProfileKeys } from "./useSession";

// Live, decrypted lists of the unlocked profile's records (decision 0012,
// Reads). A live query reads the rows; their bodies are opened outside it,
// since a live query may only await the database. An opened body is kept
// until its row is sealed again, which picks a fresh IV: so a list that
// changes reopens only the rows that changed.

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
		rows: Array<R>;
		records: Array<T>;
	} | null>(null);

	useEffect(() => {
		if (!keys || !rows) return;
		let active = true;
		void (async () => {
			const next = new Map<string, C>();
			const records: Array<T> = [];
			for (const row of rows) {
				const version = sealVersion(row);
				const content =
					cache.current.get(version) ??
					(await openBody<C>(keys, table, row.id, row.body));
				next.set(version, content);
				records.push(build(row, content));
			}
			if (!active) return;
			cache.current = next;
			setOpened({ rows, records });
		})();
		return () => {
			active = false;
		};
	}, [keys, table, rows, build]);

	if (!keys || !rows) return undefined;
	// Until the current rows are opened, the list is still loading.
	return opened?.rows === rows ? opened.records : undefined;
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

// Every save, saved or only browsed, most recent visit first.
export const useSaves = (): Array<Save> | undefined => {
	const keys = useProfileKeys();
	const rows = useRows<SaveRow>(keys, async (profileId) =>
		(
			await littleDB.saves
				.where("[profileId+keyId]")
				.between(...owned(profileId))
				.toArray()
		).sort((a, b) => b.browsedAt - a.browsedAt),
	);
	return useOpened<SaveRow, SaveContent, Save>(keys, "saves", rows, toSave);
};

// Most recently changed first.
export const useNotes = (): Array<Note> | undefined => {
	const keys = useProfileKeys();
	const rows = useRows<NoteRow>(keys, (profileId) =>
		littleDB.notes
			.where("[profileId+updatedAt]")
			.between(...owned(profileId))
			.reverse()
			.toArray(),
	);
	return useOpened<NoteRow, NoteContent, Note>(keys, "notes", rows, toNote);
};

// Open and finished tasks, soonest deadline first, undated last.
export const useTasks = (): Array<Task> | undefined => {
	const keys = useProfileKeys();
	const rows = useRows<TaskRow>(keys, async (profileId) =>
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
	return useOpened<TaskRow, TaskContent, Task>(keys, "tasks", rows, toTask);
};

// Every reminder, soonest target first, including those that have fired.
export const useReminders = (): Array<Reminder> | undefined => {
	const keys = useProfileKeys();
	const rows = useRows<ReminderRow>(keys, async (profileId) =>
		(
			await littleDB.reminders
				.where("[profileId+keyId]")
				.between(...owned(profileId))
				.toArray()
		).sort((a, b) => a.target - b.target),
	);
	return useOpened<ReminderRow, ReminderContent, Reminder>(
		keys,
		"reminders",
		rows,
		toReminder,
	);
};

// Links are plain: ids only (decision 0010).
export const useLinks = (): Array<LinkRow> | undefined => {
	const keys = useProfileKeys();
	return useRows<LinkRow>(keys, (profileId) =>
		littleDB.links
			.where("[profileId+fromId]")
			.between(...owned(profileId))
			.toArray(),
	);
};

// The ids a record links to, and the ids linking to it.
export const useLinkIndex = (links: Array<LinkRow> | undefined) =>
	useMemo(() => {
		const to = new Map<string, Set<string>>();
		const from = new Map<string, Set<string>>();
		for (const link of links ?? []) {
			if (!to.has(link.fromId)) to.set(link.fromId, new Set());
			to.get(link.fromId)!.add(link.toId);
			if (!from.has(link.toId)) from.set(link.toId, new Set());
			from.get(link.toId)!.add(link.fromId);
		}
		return {
			targetsOf: (id: string) => to.get(id) ?? new Set<string>(),
			sourcesOf: (id: string) => from.get(id) ?? new Set<string>(),
		};
	}, [links]);
