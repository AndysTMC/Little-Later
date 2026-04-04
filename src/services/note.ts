import { LNote, LNoteInsert } from "little-shared/types";
import { LDateUtl } from "little-shared/utils/datetime";
import { db } from "../utils/db";

export const createNote = async (noteInsert: LNoteInsert): Promise<number> => {
	const id = await db.noteTbl.add({
		...noteInsert,
		lastModificationDate: LDateUtl.getNow(),
	});
	return id;
};

export const deleteNote = async (id: number): Promise<void> => {
	await db.noteTbl.delete(id);
};

export const updateNote = async (id: number, modifications: Partial<LNote>) => {
	await db.noteTbl.update(id, modifications);
};

export const getNote = async (id: number): Promise<LNote | undefined> => {
	return await db.noteTbl.get(id);
};

export const getNotes = async (): Promise<Array<LNote>> => {
	return await db.noteTbl.toArray();
};
