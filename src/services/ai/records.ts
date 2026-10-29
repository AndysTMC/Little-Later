import Dexie from "dexie";
import {
	importProfileKeys,
	openAsset,
	type ProfileKeys,
} from "../../storage/keys";
import { littleDB } from "../../storage/pageDB";
import {
	PREVIEW_KIND,
	PREVIEW_TYPE,
	getSettings,
	openNote,
	openReminder,
	openSave,
	openTask,
	type Note,
	type Reminder,
	type Save,
	type Settings,
	type Task,
} from "../../storage/repositories";
import type { LinkRow, ProfileRow } from "../../storage/schema";
import { sessionStore } from "../../storage/session";

// What the AI tools read: the unlocked profile's records, opened in memory
// at query time (0010, Search). Tools change records only through
// commands (0012).

export const unlockedKeys = async (): Promise<ProfileKeys> => {
	const session = await sessionStore.get();
	if (!session) {
		throw new Error("Unlock a profile first.");
	}
	return importProfileKeys(session);
};

const owned = (profileId: string) =>
	[
		[profileId, Dexie.minKey],
		[profileId, Dexie.maxKey],
	] as const;

// Saved pages and browsing history alike.
export const readSaves = async (keys: ProfileKeys): Promise<Array<Save>> =>
	Promise.all(
		(
			await littleDB.saves
				.where("[profileId+keyId]")
				.between(...owned(keys.profileId))
				.toArray()
		).map((row) => openSave(keys, row)),
	);

export const readNotes = async (keys: ProfileKeys): Promise<Array<Note>> =>
	Promise.all(
		(
			await littleDB.notes
				.where("[profileId+updatedAt]")
				.between(...owned(keys.profileId))
				.reverse()
				.toArray()
		).map((row) => openNote(keys, row)),
	);

export const readTasks = async (keys: ProfileKeys): Promise<Array<Task>> =>
	Promise.all(
		(
			await littleDB.tasks
				.where("[profileId+keyId]")
				.between(...owned(keys.profileId))
				.toArray()
		).map((row) => openTask(keys, row)),
	);

// Fired ones too.
export const readReminders = async (
	keys: ProfileKeys,
): Promise<Array<Reminder>> =>
	Promise.all(
		(
			await littleDB.reminders
				.where("[profileId+keyId]")
				.between(...owned(keys.profileId))
				.toArray()
		).map((row) => openReminder(keys, row)),
	);

export const readLinks = (keys: ProfileKeys): Promise<Array<LinkRow>> =>
	littleDB.links
		.where("[profileId+fromId]")
		.between(...owned(keys.profileId))
		.toArray();

export const readProfile = async (keys: ProfileKeys): Promise<ProfileRow> => {
	const profile = await littleDB.profiles.get(keys.profileId);
	if (!profile) {
		throw new Error("Profile not found.");
	}
	return profile;
};

export const readPreview = async (
	keys: ProfileKeys,
	saveId: string,
): Promise<Blob | undefined> => {
	const row = await littleDB.assets
		.where("[profileId+ownerId]")
		.equals([keys.profileId, saveId])
		.filter((asset) => asset.kind === PREVIEW_KIND)
		.first();
	if (!row) {
		return undefined;
	}
	const bytes = await openAsset(keys, row.id, row.body);
	return new Blob([bytes.slice()], { type: PREVIEW_TYPE });
};

// AI provider and endpoint are sealed with the profile (0010).
export const readSettings = (keys: ProfileKeys): Promise<Settings> =>
	getSettings(littleDB, keys);
