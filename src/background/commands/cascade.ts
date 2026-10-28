import type { LittleDB } from "../../storage/schema";

// Removes records and everything that hangs off them: their links in both
// directions and their assets. Call inside a transaction over saves, notes,
// links and assets.
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
};
