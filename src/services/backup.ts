import Dexie, { type EntityTable } from "dexie";
import type { KdfParams } from "little-shared/utils/envelope";
import {
	BACKUP_EXTENSION,
	BackupError,
	backupFileParts,
	encodeHeader,
	newBackupKey,
	readBackupFile,
	sealChunk,
	type BackupEntry,
} from "../storage/backup";
import {
	importProfileKeys,
	openAsset,
	openBody,
	type ProfileKeys,
} from "../storage/keys";
import { littleDB } from "../storage/pageDB";
import {
	getSettings,
	type NoteContent,
	type ReminderContent,
	type SaveContent,
	type TaskContent,
} from "../storage/repositories";
import { sessionStore } from "../storage/session";
import { staging } from "../storage/staging";
import { send } from "../utils/send";

// Exports and imports of a whole profile (decision 0010, Backups). Export
// is a read, so it runs in the page that holds the keys (0012); import
// writes, so the worker runs it, one staged chunk per command, while the
// page that started it stays open.

const unlockedKeys = async (): Promise<ProfileKeys> => {
	const session = await sessionStore.get();
	if (!session) {
		throw new Error("Unlock a profile first.");
	}
	return importProfileKeys(session);
};

// An export reads with keys it took at the start. It checks between pages
// that the profile is still the unlocked one, so locking stops it and
// nothing is returned.
const assertStillUnlocked = async (profileId: string): Promise<void> => {
	if ((await sessionStore.get())?.profileId !== profileId) {
		throw new BackupError("The profile was locked, so the export stopped.");
	}
};

// Rows are read in pages, so a large profile is never all in memory twice.
const PAGE_SIZE = 200;
// A chunk is sealed once its entries reach about this size, which keeps
// each import command short (0012, Jobs).
const CHUNK_BYTES = 2 * 1024 * 1024;

async function* ownRows<T extends { id: string }>(
	table: EntityTable<T, "id">,
	profileId: string,
	index = "[profileId+keyId]",
): AsyncGenerator<T> {
	const ids = (await table
		.where(index)
		.between([profileId, Dexie.minKey], [profileId, Dexie.maxKey])
		.primaryKeys()) as Array<string>;
	for (let start = 0; start < ids.length; start += PAGE_SIZE) {
		const rows = await table.bulkGet(
			ids.slice(start, start + PAGE_SIZE) as Parameters<
				typeof table.bulkGet
			>[0],
		);
		await assertStillUnlocked(profileId);
		for (const row of rows) {
			if (row) {
				yield row;
			}
		}
	}
}

// Every record of the unlocked profile as backup entries, profile first.
async function* profileEntries(
	keys: ProfileKeys,
	withAssets: boolean,
): AsyncGenerator<BackupEntry> {
	const { profileId } = keys;
	const profile = await littleDB.profiles.get(profileId);
	if (!profile) {
		throw new Error("Profile not found.");
	}
	const avatar = await littleDB.avatars.get(profileId);
	yield {
		table: "profile",
		name: profile.name,
		prefs: profile.prefs,
		avatar:
			withAssets && avatar
				? {
						type: avatar.image.type,
						bytes: new Uint8Array(await avatar.image.arrayBuffer()),
					}
				: null,
	};
	yield { table: "settings", misc: (await getSettings(littleDB, keys)).misc };
	const times = (row: {
		id: string;
		createdAt: number;
		updatedAt: number;
	}) => ({
		id: row.id,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	});
	for await (const row of ownRows(littleDB.saves, profileId)) {
		yield {
			table: "saves",
			...times(row),
			saved: row.saved === 1,
			browsed: row.browsed === 1,
			browsedAt: row.browsedAt,
			privacy: row.privacy,
			content: await openBody<SaveContent>(
				keys,
				"saves",
				row.id,
				row.body,
			),
		};
	}
	for await (const row of ownRows(littleDB.notes, profileId)) {
		yield {
			table: "notes",
			...times(row),
			privacy: row.privacy,
			content: await openBody<NoteContent>(
				keys,
				"notes",
				row.id,
				row.body,
			),
		};
	}
	for await (const row of ownRows(littleDB.tasks, profileId)) {
		yield {
			table: "tasks",
			...times(row),
			schedule: row.schedule,
			dueAt: row.dueAt,
			done: row.done === 1,
			finishedAt: row.finishedAt,
			privacy: row.privacy,
			content: await openBody<TaskContent>(
				keys,
				"tasks",
				row.id,
				row.body,
			),
		};
	}
	for await (const row of ownRows(littleDB.reminders, profileId)) {
		yield {
			table: "reminders",
			...times(row),
			target: row.target,
			escalation: row.escalation,
			lastFiredAt: row.lastFiredAt,
			nextFireAt: row.nextFireAt,
			privacy: row.privacy,
			content: await openBody<ReminderContent>(
				keys,
				"reminders",
				row.id,
				row.body,
			),
		};
	}
	for await (const row of ownRows(
		littleDB.links,
		profileId,
		"[profileId+fromId]",
	)) {
		yield {
			table: "links",
			id: row.id,
			fromId: row.fromId,
			toId: row.toId,
			createdAt: row.createdAt,
		};
	}
	if (withAssets) {
		for await (const row of ownRows(littleDB.assets, profileId)) {
			yield {
				table: "assets",
				...times(row),
				ownerId: row.ownerId,
				kind: row.kind,
				bytes: await openAsset(keys, row.id, row.body),
			};
		}
	}
}

const entrySize = (entry: BackupEntry): number =>
	entry.table === "assets"
		? entry.bytes.length
		: entry.table === "profile"
			? (entry.avatar?.bytes.length ?? 0)
			: JSON.stringify(entry).length;

// The unlocked profile as an importable backup. Passing kdf lets tests use
// a cheap iteration count.
export const createBackup = async (
	password: string,
	kdf?: KdfParams,
): Promise<Blob> => {
	// The imported profile opens with this password, so it follows the
	// profile password rules (decision 0007, A1).
	if (password === "" || password !== password.trim()) {
		throw new BackupError(
			"Choose a backup password that doesn't start or end with a space.",
		);
	}
	const keys = await unlockedKeys();
	const { header, keys: backupKeys } = await newBackupKey(password, kdf);
	const chunks: Array<Uint8Array> = [];
	let pending: Array<BackupEntry> = [];
	let pendingBytes = 0;
	const flush = async (last: boolean) => {
		chunks.push(
			await sealChunk(backupKeys, header.backupId, chunks.length, {
				last,
				entries: pending,
			}),
		);
		pending = [];
		pendingBytes = 0;
	};
	for await (const entry of profileEntries(keys, true)) {
		if (
			pending.length > 0 &&
			pendingBytes + entrySize(entry) > CHUNK_BYTES
		) {
			await flush(false);
		}
		pending.push(entry);
		pendingBytes += entrySize(entry);
	}
	await flush(true);
	await assertStillUnlocked(keys.profileId);
	return new Blob(
		backupFileParts(encodeHeader(header), chunks).map((part) =>
			part.slice(),
		),
		{ type: "application/octet-stream" },
	);
};

const isoOrNull = (ms: number): string | null =>
	ms === 0 ? null : new Date(ms).toISOString();

// Plain JSON for people to read: no images, no AI key (0010).
export const createReadableExport = async (): Promise<unknown> => {
	const keys = await unlockedKeys();
	const out: Record<string, unknown> = {
		app: "Little Later",
		exportedAt: new Date().toISOString(),
	};
	const listOf = (table: string) =>
		((out[table] as Array<unknown> | undefined) ??= []) as Array<unknown>;
	for await (const entry of profileEntries(keys, false)) {
		switch (entry.table) {
			case "profile":
				out.profile = { name: entry.name, prefs: entry.prefs };
				break;
			case "settings": {
				const { ai } = await getSettings(littleDB, keys);
				out.settings = { misc: entry.misc, ai: { ...ai, apiKey: "" } };
				break;
			}
			case "saves":
				listOf("saves").push({
					id: entry.id,
					...entry.content,
					saved: entry.saved,
					browsed: entry.browsed,
					browsedAt: isoOrNull(entry.browsedAt),
					createdAt: isoOrNull(entry.createdAt),
					updatedAt: isoOrNull(entry.updatedAt),
				});
				break;
			case "notes":
				listOf("notes").push({
					id: entry.id,
					...entry.content,
					createdAt: isoOrNull(entry.createdAt),
					updatedAt: isoOrNull(entry.updatedAt),
				});
				break;
			case "tasks":
				listOf("tasks").push({
					id: entry.id,
					...entry.content,
					schedule:
						entry.schedule.kind === "due"
							? { kind: "due", at: isoOrNull(entry.schedule.at) }
							: entry.schedule,
					dueAt: isoOrNull(entry.dueAt),
					done: entry.done,
					finishedAt: isoOrNull(entry.finishedAt),
					createdAt: isoOrNull(entry.createdAt),
					updatedAt: isoOrNull(entry.updatedAt),
				});
				break;
			case "reminders":
				listOf("reminders").push({
					id: entry.id,
					...entry.content,
					target: isoOrNull(entry.target),
					escalating: entry.escalation !== null,
					lastFiredAt: isoOrNull(entry.lastFiredAt),
					createdAt: isoOrNull(entry.createdAt),
					updatedAt: isoOrNull(entry.updatedAt),
				});
				break;
			case "links":
				listOf("links").push({
					fromId: entry.fromId,
					toId: entry.toId,
				});
				break;
			case "assets":
				break;
		}
	}
	await assertStillUnlocked(keys.profileId);
	return out;
};

const download = (blob: Blob, filename: string): void => {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
};

export const exportBackup = async (password: string): Promise<void> =>
	download(
		await createBackup(password),
		`Little-Later-Backup${BACKUP_EXTENSION}`,
	);

export const exportReadable = async (): Promise<void> =>
	download(
		new Blob([JSON.stringify(await createReadableExport(), null, 2)], {
			type: "application/json",
		}),
		"Little-Later-Readable.json",
	);

// Imports a backup into a new profile, protected by the backup's password.
// Each chunk is staged as it is, since it is already encrypted (0012). On
// any failure the half-built profile is removed.
export const importBackup = async (
	file: Blob,
	password: string,
	onProgress?: (done: number, total: number) => void,
): Promise<void> => {
	const { header, chunks } = readBackupFile(
		new Uint8Array(await file.arrayBuffer()),
	);
	const { jobId } = await send("backup.importBegin", {
		header: await staging.put(header.slice()),
		password,
	});
	try {
		for (const [index, chunk] of chunks.entries()) {
			const { done } = await send("backup.importChunk", {
				jobId,
				chunk: await staging.put(chunk.slice()),
			});
			onProgress?.(index + 1, chunks.length);
			// The last chunk says so inside its sealed content.
			if (done) {
				return;
			}
		}
		throw new BackupError("This backup is incomplete.");
	} catch (error) {
		await send("backup.importAbort", { jobId }).catch(() => undefined);
		throw error;
	}
};
