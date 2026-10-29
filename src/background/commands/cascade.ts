import type { LittleDB } from "../../storage/schema";

// Every table a cascade touches; transactions that call removeRecords
// open these.
export const cascadeTables = (db: LittleDB) => [
	db.saves,
	db.notes,
	db.tasks,
	db.reminders,
	db.links,
	db.assets,
];

// Removes records of any kind and everything that hangs off them: their
// links in both directions and their assets. Call inside a transaction over
// cascadeTables.
export const removeRecords = async (
	db: LittleDB,
	profileId: string,
	ids: ReadonlyArray<string>,
): Promise<void> => {
	if (ids.length === 0) {
		return;
	}
	const keys = ids.map((id) => [profileId, id]);
	await db.links.where("[profileId+fromId]").anyOf(keys).delete();
	await db.links.where("[profileId+toId]").anyOf(keys).delete();
	await db.assets.where("[profileId+ownerId]").anyOf(keys).delete();
	await db.saves.bulkDelete([...ids]);
	await db.notes.bulkDelete([...ids]);
	await db.tasks.bulkDelete([...ids]);
	await db.reminders.bulkDelete([...ids]);
};
