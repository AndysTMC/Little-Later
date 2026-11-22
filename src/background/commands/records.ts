import type { ProfileKeys } from "../../storage/keys";
import type { LittleDB } from "../../storage/schema";
import { MAX_TAGS_PER_RECORD, normalizeTags } from "../../utils/tags";
import { CommandError, asString, fail } from "./registry";

// Shared by commands that attach a record to saves. A record's saves are
// sent as one set with the command that creates or edits it, so the record
// and its links change in one transaction: a form that linked each save
// with its own command could fail halfway and, retried, make a duplicate.

const MAX_SAVE_LINKS = 1000;

export const optionalSaveIds = (value: unknown): Array<string> | undefined => {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value) || value.length > MAX_SAVE_LINKS) {
		fail("saveIds must be a list of save ids.");
	}
	return [
		...new Set(
			(value as Array<unknown>).map((id) => asString(id, "saveIds")),
		),
	];
};

export const assertOwnSaves = async (
	db: LittleDB,
	keys: ProfileKeys,
	saveIds: ReadonlyArray<string> | undefined,
): Promise<void> => {
	if (!saveIds || saveIds.length === 0) {
		return;
	}
	const saves = await db.saves.bulkGet([...saveIds]);
	if (saves.some((save) => !save || save.profileId !== keys.profileId)) {
		throw new CommandError("rejected", "Save not found.");
	}
};

// Makes the saves `fromId` links to exactly `saveIds`, leaving its links to
// other kinds of record alone. Call inside a transaction over links and
// saves.
export const setSaveLinks = async (
	db: LittleDB,
	profileId: string,
	fromId: string,
	saveIds: ReadonlyArray<string>,
	now: number,
): Promise<void> => {
	const current = await db.links
		.where("[profileId+fromId]")
		.equals([profileId, fromId])
		.toArray();
	const targets = await db.saves.bulkGet(current.map((link) => link.toId));
	const toSaves = new Set(targets.flatMap((save) => (save ? [save.id] : [])));
	const wanted = new Set(saveIds);
	for (const link of current) {
		if (toSaves.has(link.toId) && !wanted.has(link.toId)) {
			await db.links.delete(link.id);
		}
	}
	const linked = new Set(current.map((link) => link.toId));
	for (const saveId of wanted) {
		if (!linked.has(saveId)) {
			await db.links.add({
				id: crypto.randomUUID(),
				profileId,
				fromId,
				toId: saveId,
				createdAt: now,
			});
		}
	}
};

export const boundedText = (
	value: unknown,
	field: string,
	max: number,
	allowEmpty = false,
): string => {
	const text = asString(value, field).trim();
	return (allowEmpty || text !== "") && text.length <= max
		? text
		: fail(`${field} must be ${allowEmpty ? 0 : 1} to ${max} characters.`);
};

export const asInstant = (value: unknown, field: string): number =>
	Number.isSafeInteger(value) && (value as number) > 0
		? (value as number)
		: fail(`${field} must be a time in epoch milliseconds.`);

export const optionalTags = (value: unknown): Array<string> | undefined => {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value) || value.length > MAX_TAGS_PER_RECORD * 2) {
		fail("tags must be a list of tag names.");
	}
	return normalizeTags(
		(value as Array<unknown>).map((entry) => asString(entry, "tags")),
	);
};
