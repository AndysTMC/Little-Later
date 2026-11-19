import Dexie, { type EntityTable } from "dexie";
import type { KdfParams } from "little-shared/utils/envelope";
import {
	BACKUP_EXTENSION,
	BackupError,
	backupFileBlob,
	chunkBlob,
	encodeHeader,
	newBackupKey,
	readBackupParts,
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

// Opens one record for the export. A backup must not leave records out
// silently, so a record that cannot be opened stops it, naming the record.
const openForExport = async <T>(
	table: string,
	id: string,
	open: () => Promise<T>,
): Promise<T> => {
	try {
		return await open();
	} catch (error) {
		console.error(`Couldn't open ${table} ${id} for the export.`, error);
		throw new Error(
			`A record in ${table} (${id}) can't be read, so the export stopped.`,
			{ cause: error },
		);
	}
};

// The profile's records and links as they were at one moment. They are
// read in one IndexedDB transaction, so an edit made while the export runs
// is either wholly in it or wholly out: reading table by table let a note
// and its link to a page in, without the page. Bodies are opened after the
// transaction, which cannot wait for decryption. Only encrypted text is
// held here; assets, the large part, are read afterwards, so the snapshot
// notes which records had one: an asset gone by then means the profile
// changed under the export.
const recordsSnapshot = async (profileId: string) => {
	const owned = <T>(
		table: EntityTable<T & { id: string }, "id">,
		index: string,
	) =>
		table
			.where(index)
			.between([profileId, Dexie.minKey], [profileId, Dexie.maxKey])
			.toArray();
	return littleDB.transaction(
		"r",
		[
			littleDB.saves,
			littleDB.notes,
			littleDB.tasks,
			littleDB.reminders,
			littleDB.links,
			littleDB.assets,
		],
		async () => ({
			saves: await owned(littleDB.saves, "[profileId+keyId]"),
			notes: await owned(littleDB.notes, "[profileId+keyId]"),
			tasks: await owned(littleDB.tasks, "[profileId+keyId]"),
			reminders: await owned(littleDB.reminders, "[profileId+keyId]"),
			links: await owned(littleDB.links, "[profileId+fromId]"),
			assetOwners: new Set(
				(
					(await littleDB.assets
						.where("[profileId+ownerId]")
						.between(
							[profileId, Dexie.minKey],
							[profileId, Dexie.maxKey],
						)
						.keys()) as unknown as Array<[string, string]>
				).map(([, ownerId]) => ownerId),
			),
		}),
	);
};

// The profile changed while the export read its assets. The export starts
// again rather than write a record without its preview.
class ExportChangedError extends Error {}
const EXPORT_ATTEMPTS = 3;

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
	const snapshot = await recordsSnapshot(profileId);
	await assertStillUnlocked(profileId);
	for (const row of snapshot.saves) {
		yield {
			table: "saves",
			...times(row),
			saved: row.saved === 1,
			browsed: row.browsed === 1,
			browsedAt: row.browsedAt,
			privacy: row.privacy,
			content: await openForExport("saves", row.id, () =>
				openBody<SaveContent>(keys, "saves", row.id, row.body),
			),
		};
	}
	for (const row of snapshot.notes) {
		yield {
			table: "notes",
			...times(row),
			privacy: row.privacy,
			content: await openForExport("notes", row.id, () =>
				openBody<NoteContent>(keys, "notes", row.id, row.body),
			),
		};
	}
	for (const row of snapshot.tasks) {
		yield {
			table: "tasks",
			...times(row),
			schedule: row.schedule,
			dueAt: row.dueAt,
			occursOn: row.occursOn,
			done: row.done === 1,
			finishedAt: row.finishedAt,
			privacy: row.privacy,
			content: await openForExport("tasks", row.id, () =>
				openBody<TaskContent>(keys, "tasks", row.id, row.body),
			),
		};
	}
	for (const row of snapshot.reminders) {
		yield {
			table: "reminders",
			...times(row),
			target: row.target,
			escalation: row.escalation,
			lastFiredAt: row.lastFiredAt,
			nextFireAt: row.nextFireAt,
			privacy: row.privacy,
			content: await openForExport("reminders", row.id, () =>
				openBody<ReminderContent>(keys, "reminders", row.id, row.body),
			),
		};
	}
	for (const row of snapshot.links) {
		yield {
			table: "links",
			id: row.id,
			fromId: row.fromId,
			toId: row.toId,
			createdAt: row.createdAt,
		};
	}
	if (withAssets) {
		// Only the assets of records in the snapshot: one added for a page
		// saved after it would have nothing to belong to.
		const inSnapshot = new Set(
			[snapshot.saves, snapshot.notes, snapshot.tasks, snapshot.reminders]
				.flat()
				.map((row) => row.id),
		);
		const missing = new Set(
			[...snapshot.assetOwners].filter((id) => inSnapshot.has(id)),
		);
		for await (const row of ownRows(littleDB.assets, profileId)) {
			if (!inSnapshot.has(row.ownerId)) continue;
			missing.delete(row.ownerId);
			yield {
				table: "assets",
				...times(row),
				ownerId: row.ownerId,
				kind: row.kind,
				bytes: await openForExport("assets", row.id, () =>
					openAsset(keys, row.id, row.body),
				),
			};
		}
		if (missing.size > 0) {
			throw new ExportChangedError();
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
// `keysOf` gives the keys of the profile to export: the unlocked one, or,
// for an AI request, the profile the request belongs to (ai/owner.ts).
type KeysOf = () => Promise<ProfileKeys>;

export const createBackup = async (
	password: string,
	kdf?: KdfParams,
	keysOf: KeysOf = unlockedKeys,
): Promise<Blob> => {
	// The imported profile opens with this password, so it follows the
	// profile password rules (decision 0007, A1).
	if (password === "" || password !== password.trim()) {
		throw new BackupError(
			"Choose a backup password that doesn't start or end with a space.",
		);
	}
	const keys = await keysOf();
	const { header, keys: backupKeys } = await newBackupKey(password, kdf);
	// Each sealed chunk is handed to a Blob at once, so the export never
	// holds the whole backup in memory (the browser may page it to disk).
	const sealAll = async (): Promise<Array<Blob>> => {
		const chunks: Array<Blob> = [];
		let pending: Array<BackupEntry> = [];
		let pendingBytes = 0;
		const flush = async (last: boolean) => {
			chunks.push(
				chunkBlob(
					await sealChunk(
						backupKeys,
						header.backupId,
						chunks.length,
						{ last, entries: pending },
					),
				),
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
		return chunks;
	};
	for (let attempt = 1; ; attempt += 1) {
		try {
			const chunks = await sealAll();
			await assertStillUnlocked(keys.profileId);
			return backupFileBlob(encodeHeader(header), chunks);
		} catch (error) {
			if (!(error instanceof ExportChangedError)) throw error;
			if (attempt === EXPORT_ATTEMPTS) {
				throw new BackupError(
					"Pages kept changing while the backup was made, so it stopped. Try again.",
				);
			}
		}
	}
};

const isoOrNull = (ms: number): string | null =>
	ms === 0 ? null : new Date(ms).toISOString();

// Plain JSON for people to read: no images, no AI key (0010).
export const createReadableExport = async (
	keysOf: KeysOf = unlockedKeys,
): Promise<unknown> => {
	const keys = await keysOf();
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

export const exportBackup = async (
	password: string,
	keysOf?: KeysOf,
): Promise<void> =>
	download(
		await createBackup(password, undefined, keysOf),
		`Little-Later-Backup${BACKUP_EXTENSION}`,
	);

export const exportReadable = async (keysOf?: KeysOf): Promise<void> =>
	download(
		new Blob(
			[JSON.stringify(await createReadableExport(keysOf), null, 2)],
			{
				type: "application/json",
			},
		),
		"Little-Later-Readable.json",
	);

// Imports a backup into a new profile, protected by the backup's password.
// Each chunk is staged as it is, since it is already encrypted (0012). On
// any failure the half-built profile is removed.
export const importBackup = async (
	file: Blob,
	password: string,
): Promise<{ skippedLinks: number }> => {
	// Read and staged a chunk at a time, never the whole file at once.
	const parts = readBackupParts(file);
	const first = await parts.next();
	if (first.done || first.value.kind !== "header") {
		throw new BackupError("This backup is damaged.");
	}
	const { jobId } = await send("backup.importBegin", {
		header: await staging.put(first.value.bytes.slice()),
		password,
	});
	try {
		for await (const part of parts) {
			const { done, skippedLinks } = await send("backup.importChunk", {
				jobId,
				chunk: await staging.put(part.bytes.slice()),
			});
			// The last chunk says so inside its sealed content.
			if (done) {
				return { skippedLinks };
			}
		}
		throw new BackupError("This backup is incomplete.");
	} catch (error) {
		await send("backup.importAbort", { jobId }).catch(() => undefined);
		throw error;
	}
};
