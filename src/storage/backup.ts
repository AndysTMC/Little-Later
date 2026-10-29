import {
	EnvelopeError,
	deriveContentKeys,
	newKdfParams,
	openValue,
	randomKeyBytes,
	sealValue,
	unwrapKey,
	wrapKey,
	type ContentKeys,
	type KdfParams,
	type WrappedKey,
} from "little-shared/utils/envelope";
import type { Escalation } from "little-shared/utils/schedule";
import type {
	NoteContent,
	ReminderContent,
	SaveContent,
	Settings,
	TaskContent,
} from "./repositories";
import type { Privacy, ProfileRow, TaskSchedule } from "./schema";
import { fromBase64, toBase64 } from "./session";

// `.lldat` format 3 (decision 0010, Backups). A backup is protected by a
// password chosen at export, which wraps a random backup key; the profile's
// rows are opened and sealed again under that key in chunks:
//
//   "LLDAT" | format (1 byte) | header length (u32) | header (JSON)
//   then per chunk: length (u32) | envelope
//
// The header names the backup and holds its wrapped key, whose additional
// data binds the KDF parameters. Each chunk's additional data binds the
// backup and the chunk's position, and its content says whether it is the
// last, so chunks cannot be reordered, swapped between backups or dropped
// without the import failing.

export const BACKUP_MAGIC = new Uint8Array([0x4c, 0x4c, 0x44, 0x41, 0x54]);
export const BACKUP_FORMAT = 3;
export const BACKUP_EXTENSION = ".lldat";
// The wrap's key id; a backup has one key.
const BACKUP_KEY_ID = 1;
const PREFIX_LENGTH = BACKUP_MAGIC.length + 1;
const MAX_HEADER_BYTES = 64 * 1024;
// Chunks are sized well below this at export; the bound keeps a damaged
// length from asking for gigabytes.
export const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

export class BackupError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BackupError";
	}
}

// What a backup holds per record: its plain fields and its opened content.
// Keys, key ids, owners and index values are not carried; an import makes
// its own (0010).
type Times = { id: string; createdAt: number; updatedAt: number };

export type BackupEntry =
	| {
			table: "profile";
			name: string;
			prefs: ProfileRow["prefs"];
			avatar: { type: string; bytes: Uint8Array } | null;
	  }
	// History limits only: AI settings never leave the profile in a backup,
	// and an import starts with default ones (decision 0007, A16).
	| { table: "settings"; misc: Settings["misc"] }
	| (Times & {
			table: "saves";
			saved: boolean;
			browsed: boolean;
			browsedAt: number;
			privacy: Privacy;
			content: SaveContent;
	  })
	| (Times & { table: "notes"; privacy: Privacy; content: NoteContent })
	| (Times & {
			table: "tasks";
			schedule: TaskSchedule;
			dueAt: number;
			done: boolean;
			finishedAt: number;
			privacy: Privacy;
			content: TaskContent;
	  })
	| (Times & {
			table: "reminders";
			target: number;
			escalation: Escalation | null;
			lastFiredAt: number;
			nextFireAt: number;
			privacy: Privacy;
			content: ReminderContent;
	  })
	| {
			table: "links";
			id: string;
			fromId: string;
			toId: string;
			createdAt: number;
	  }
	| (Times & {
			table: "assets";
			ownerId: string;
			kind: string;
			bytes: Uint8Array;
	  });

export type BackupHeader = { backupId: string; wrapped: WrappedKey };

export type BackupChunk = { last: boolean; entries: Array<BackupEntry> };

const chunkLocation = (backupId: string, index: number) => ({
	table: "backup",
	id: String(index),
	profileId: backupId,
	field: "chunk",
});

// Passing kdf lets tests use a cheap iteration count.
export const newBackupKey = async (
	password: string,
	kdf: KdfParams = newKdfParams(),
): Promise<{ header: BackupHeader; keys: ContentKeys }> => {
	if (password === "") {
		throw new BackupError("A backup needs a password.");
	}
	const backupId = crypto.randomUUID();
	const key = randomKeyBytes();
	return {
		header: {
			backupId,
			wrapped: await wrapKey(key, password, backupId, BACKUP_KEY_ID, kdf),
		},
		keys: await deriveContentKeys(key, BACKUP_KEY_ID),
	};
};

// A wrong password and a damaged header look the same.
export const openBackupKey = async (
	header: BackupHeader,
	password: string,
): Promise<ContentKeys> => {
	try {
		return await deriveContentKeys(
			await unwrapKey(header.wrapped, password, header.backupId),
			BACKUP_KEY_ID,
		);
	} catch (error) {
		if (error instanceof EnvelopeError) {
			throw new BackupError(
				"Couldn't open this backup. The password is wrong or the file is damaged.",
			);
		}
		throw error;
	}
};

export const sealChunk = (
	keys: ContentKeys,
	backupId: string,
	index: number,
	chunk: BackupChunk,
): Promise<Uint8Array> =>
	sealValue(keys, chunkLocation(backupId, index), chunk);

// The content is checked entry by entry by the import.
export const openChunk = async (
	keys: ContentKeys,
	backupId: string,
	index: number,
	envelope: Uint8Array,
): Promise<{ last: boolean; entries: Array<unknown> }> => {
	let chunk: unknown;
	try {
		chunk = await openValue(keys, chunkLocation(backupId, index), envelope);
	} catch (error) {
		if (error instanceof EnvelopeError) {
			throw new BackupError("This backup is damaged.");
		}
		throw error;
	}
	if (
		typeof chunk !== "object" ||
		chunk === null ||
		typeof (chunk as BackupChunk).last !== "boolean" ||
		!Array.isArray((chunk as BackupChunk).entries)
	) {
		throw new BackupError("This backup is damaged.");
	}
	return chunk as { last: boolean; entries: Array<unknown> };
};

// The header is JSON with base64 bytes, readable without a decoder.
type HeaderJson = {
	backupId: string;
	keyId: number;
	kdf: { name: string; iterations: number; salt: string };
	iv: string;
	ciphertext: string;
};

export const encodeHeader = ({
	backupId,
	wrapped,
}: BackupHeader): Uint8Array => {
	const json: HeaderJson = {
		backupId,
		keyId: wrapped.keyId,
		kdf: {
			name: wrapped.kdf.name,
			iterations: wrapped.kdf.iterations,
			salt: toBase64(wrapped.kdf.salt),
		},
		iv: toBase64(wrapped.iv),
		ciphertext: toBase64(wrapped.ciphertext),
	};
	return new TextEncoder().encode(JSON.stringify(json));
};

// Shapes only; unwrapping checks the values (0010).
export const decodeHeader = (bytes: Uint8Array): BackupHeader => {
	try {
		const json = JSON.parse(new TextDecoder().decode(bytes)) as HeaderJson;
		if (
			typeof json.backupId !== "string" ||
			json.keyId !== BACKUP_KEY_ID ||
			typeof json.kdf?.name !== "string" ||
			typeof json.kdf.iterations !== "number"
		) {
			throw new BackupError("This backup is damaged.");
		}
		return {
			backupId: json.backupId,
			wrapped: {
				keyId: json.keyId,
				kdf: {
					name: json.kdf.name as KdfParams["name"],
					iterations: json.kdf.iterations,
					salt: fromBase64(json.kdf.salt),
				},
				iv: fromBase64(json.iv),
				ciphertext: fromBase64(json.ciphertext),
			},
		};
	} catch {
		throw new BackupError("This backup is damaged.");
	}
};

const u32 = (value: number): Uint8Array => {
	const bytes = new Uint8Array(4);
	new DataView(bytes.buffer).setUint32(0, value);
	return bytes;
};

// The file's bytes in order, so a large backup can become a Blob without
// one more copy.
export const backupFileParts = (
	header: Uint8Array,
	chunks: ReadonlyArray<Uint8Array>,
): Array<Uint8Array> => [
	BACKUP_MAGIC,
	new Uint8Array([BACKUP_FORMAT]),
	u32(header.length),
	header,
	...chunks.flatMap((chunk) => [u32(chunk.length), chunk]),
];

export const writeBackupFile = (
	header: Uint8Array,
	chunks: ReadonlyArray<Uint8Array>,
): Uint8Array<ArrayBuffer> => {
	const parts = backupFileParts(header, chunks);
	const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
};

// Splits a file into its header and chunk envelopes without opening them.
export const readBackupFile = (
	file: Uint8Array,
): { header: Uint8Array; chunks: Array<Uint8Array> } => {
	const magic = BACKUP_MAGIC.every((byte, i) => file[i] === byte);
	if (file.length < PREFIX_LENGTH || !magic) {
		throw new BackupError("This is not a Little Later backup.");
	}
	const format = file[BACKUP_MAGIC.length];
	if (format !== BACKUP_FORMAT) {
		throw new BackupError(
			format < BACKUP_FORMAT
				? "This backup is from an older version of Little Later and can't be imported."
				: "This backup is from a newer version of Little Later. Update the extension to import it.",
		);
	}
	const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
	const part = (offset: number, max: number) => {
		if (offset + 4 > file.length) {
			throw new BackupError("This backup is damaged.");
		}
		const length = view.getUint32(offset);
		if (length === 0 || length > max || offset + 4 + length > file.length) {
			throw new BackupError("This backup is damaged.");
		}
		return file.slice(offset + 4, offset + 4 + length);
	};
	const header = part(PREFIX_LENGTH, MAX_HEADER_BYTES);
	const chunks: Array<Uint8Array> = [];
	let offset = PREFIX_LENGTH + 4 + header.length;
	while (offset < file.length) {
		const chunk = part(offset, MAX_CHUNK_BYTES);
		chunks.push(chunk);
		offset += 4 + chunk.length;
	}
	if (chunks.length === 0) {
		throw new BackupError("This backup is damaged.");
	}
	return { header, chunks };
};
