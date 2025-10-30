import { LNote } from "little-shared/types";
import { IDJSONSchema, IDJSONObjectInstruction } from "../config";
import { LittleAI } from "../../../services/ai";
import { getDBTables } from "../../../utils/db";
import { searchNotesByText } from "../../../utils/note";

const toolCall = async (ai: LittleAI, query: string): Promise<Array<LNote>> => {
	const { noteTbl } = await getDBTables(["noteTbl"]);
	if (noteTbl === undefined) {
		throw new Error("Note table is not available in the database.");
	}
	let resultNotes: LNote[] = noteTbl.slice();
	const filteredNotes = searchNotesByText(noteTbl, query);
	const queryNotes: LNote[] = [];
	filteredNotes.forEach((note) => {
		if (!queryNotes.includes(note)) {
			queryNotes.push(note);
		}
	});
	const response = await ai.getStructuredResponse(
		`
            Here is a list of notes in JSON format:
            ${JSON.stringify(noteTbl, null, 2)}

            The user's query is: "${query}".

            Find all relevant ids of notes where the content matches or relates to the query.
        `,
		IDJSONSchema,
		IDJSONObjectInstruction,
	);
	const symanticNoteIds = (response as { ids: number[] }).ids;
	const symanticNotes = noteTbl.filter((note) =>
		symanticNoteIds.includes(note.id),
	);
	symanticNotes.forEach((note) => {
		if (!queryNotes.includes(note)) {
			queryNotes.push(note);
		}
	});
	resultNotes = resultNotes.filter((note) => queryNotes.includes(note));
	return resultNotes;
};

export { toolCall as searchNotesToolCall };
