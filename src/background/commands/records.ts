import type { ProfileKeys } from "../../storage/keys";
import type { LittleDB } from "../../storage/schema";
import { CommandError, asString, fail } from "./registry";

// Shared by commands that attach a record to a save.

export const optionalSaveId = (value: unknown): string | undefined =>
	value === undefined ? undefined : asString(value, "saveId");

export const assertOwnSave = async (
	db: LittleDB,
	keys: ProfileKeys,
	saveId: string | undefined,
): Promise<void> => {
	if (saveId === undefined) {
		return;
	}
	const save = await db.saves.get(saveId);
	if (!save || save.profileId !== keys.profileId) {
		throw new CommandError("rejected", "Save not found.");
	}
};

export const linkToSave = async (
	db: LittleDB,
	profileId: string,
	fromId: string,
	saveId: string | undefined,
	now: number,
): Promise<void> => {
	if (saveId !== undefined) {
		await db.links.add({
			id: crypto.randomUUID(),
			profileId,
			fromId,
			toId: saveId,
			createdAt: now,
		});
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
