import { LNote, LNoteInsert } from "little-shared/types";
import { LDateUtl } from "little-shared/utils/datetime";
import { db } from "../utils/db";
import { localFetch } from "../utils/littleLocal";

export const createNote = async (noteInsert: LNoteInsert): Promise<number> => {
	const response = await localFetch("/note", {
		method: "POST",
		body: JSON.stringify({ noteInsert }),
		headers: { "Content-Type": "application/json" },
	});
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	const id = await db.noteTbl.add({
		...noteInsert,
		lastModificationDate: LDateUtl.getNow(),
	});
	return id;
};

export const deleteNote = async (id: number): Promise<void> => {
	const response = await localFetch("/note/" + id, {
		method: "DELETE",
	});
	if (response.use) {
		return;
	}
	await db.noteTbl.delete(id);
};

export const updateNote = async (id: number, modifications: Partial<LNote>) => {
	const response = await localFetch("/note/" + id, {
		method: "PATCH",
		body: JSON.stringify({ modifications }),
		headers: { "Content-Type": "application/json" },
	});
	if (response.use) {
		return;
	}
	await db.noteTbl.update(id, modifications);
};

export const getNote = async (id: number): Promise<LNote | undefined> => {
	const response = await localFetch("/note/" + id);
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	return await db.noteTbl.get(id);
};

export const getNotes = async (): Promise<Array<LNote>> => {
	const response = await localFetch("/note");
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	return await db.noteTbl.toArray();
};
