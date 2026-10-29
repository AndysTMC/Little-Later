import Dexie, { type EntityTable } from "dexie";
import type { WrappedKey } from "little-shared/utils/envelope";
import type { Escalation, RecurrenceRule } from "little-shared/utils/schedule";

// Storage format v1 (decision 0010). Each table lists which fields are
// plain and why; everything else lives in the encrypted `body`.

export const LITTLE_DB_NAME = "little";

export type Privacy = "private" | "public";

// Plain on every record: its owner, the key that sealed it (so a re-key job
// can find rows still under an old key), and when it changed.
type RecordBase = {
	id: string;
	profileId: string;
	keyId: number;
	createdAt: number;
	updatedAt: number;
	body: Uint8Array;
};

export type ProfileKeyEntry =
	| { keyId: number; wrapped: WrappedKey }
	// Profiles without a password keep the root key as is, and the UI says
	// "not encrypted at rest".
	| { keyId: number; raw: Uint8Array };

export type ProfileRow = {
	id: string;
	// Plain: the lock screen shows them.
	name: string;
	createdAt: number;
	protection: "password" | "none";
	// Root keys, newest last. Two entries only while a re-key runs.
	keys: Array<ProfileKeyEntry>;
	currentKeyId: number;
	// The index key, sealed under the root key it names in its header.
	indexKey: Uint8Array;
	// Plain: the locked worker and lock screen need them.
	prefs: { theme: string; autoLockMinutes: number };
};

export type AvatarRow = { profileId: string; image: Blob };

export type SaveRow = RecordBase & {
	// Plain HMACs under the profile's index key: de-duplication and the
	// per-site history limit without decrypting.
	urlKey: string;
	originKey: string;
	saved: 0 | 1;
	browsed: 0 | 1;
	browsedAt: number;
	privacy: Privacy;
};

export type NoteRow = RecordBase & { privacy: Privacy };

// When a task is due (decision 0011). Plain, like a reminder's schedule:
// it shows when, not what.
export type TaskSchedule =
	| { kind: "anytime" }
	| { kind: "due"; at: number }
	| { kind: "recurring"; rule: RecurrenceRule };

export type TaskRow = RecordBase & {
	schedule: TaskSchedule;
	// Plain so due lists are range queries. For a recurring task, the
	// occurrence currently open. 0 means no deadline.
	dueAt: number;
	// A recurring task is never done; finishing it moves dueAt on.
	done: 0 | 1;
	finishedAt: number;
	privacy: Privacy;
};

export type ReminderRow = RecordBase & {
	// Plain so reminders fire while locked (0011).
	target: number;
	escalation: Escalation | null;
	lastFiredAt: number;
	// 0 once the reminder has fired for the last time.
	nextFireAt: number;
	privacy: Privacy;
};

// Plain relation between two records; ids only, no content.
export type LinkRow = {
	id: string;
	profileId: string;
	fromId: string;
	toId: string;
	createdAt: number;
};

export type AssetRow = RecordBase & { ownerId: string; kind: string };

// One per profile, with id equal to profileId so every sealed table shares
// one shape: AI provider, base URL, API key, model and other sensitive
// settings.
export type SettingsRow = RecordBase;

// A long job tied to an open page (decision 0012, Jobs). An import still
// `running` when the worker starts was cut off: its rows are deleted.
export type JobRow = {
	id: string;
	kind: "import";
	profileId: string;
	state: "running";
	startedAt: number;
};

export type LittleDB = Dexie & {
	profiles: EntityTable<ProfileRow, "id">;
	avatars: EntityTable<AvatarRow, "profileId">;
	saves: EntityTable<SaveRow, "id">;
	notes: EntityTable<NoteRow, "id">;
	tasks: EntityTable<TaskRow, "id">;
	reminders: EntityTable<ReminderRow, "id">;
	links: EntityTable<LinkRow, "id">;
	assets: EntityTable<AssetRow, "id">;
	settings: EntityTable<SettingsRow, "id">;
	jobs: EntityTable<JobRow, "id">;
};

// Tables whose rows carry a sealed body under a profile key.
export const SEALED_TABLES = [
	"saves",
	"notes",
	"tasks",
	"reminders",
	"assets",
	"settings",
] as const;
export type SealedTable = (typeof SEALED_TABLES)[number];

export const openLittleDB = (name: string = LITTLE_DB_NAME): LittleDB => {
	const db = new Dexie(name) as LittleDB;
	db.version(1).stores({
		profiles: "id",
		avatars: "profileId",
		saves: "id, &[profileId+urlKey], [profileId+originKey], [profileId+saved+browsedAt], [profileId+browsed+browsedAt], [profileId+keyId]",
		notes: "id, [profileId+updatedAt], [profileId+keyId]",
		tasks: "id, [profileId+done+dueAt], [profileId+keyId]",
		reminders: "id, [profileId+nextFireAt], [profileId+keyId]",
		links: "id, [profileId+fromId], [profileId+toId]",
		assets: "id, [profileId+ownerId], [profileId+keyId]",
		settings: "id, [profileId+keyId]",
		jobs: "id",
	});
	return db;
};
