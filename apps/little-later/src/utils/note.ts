import { LNote } from "little-shared/types";

export const searchNotesByText = (
	notes: LNote[],
	textToSearchWith: string,
): Array<LNote> => {
	const filteredNotes = notes.filter((note) =>
		note.content.toLowerCase().includes(textToSearchWith.toLowerCase()),
	);
	return filteredNotes;
};
