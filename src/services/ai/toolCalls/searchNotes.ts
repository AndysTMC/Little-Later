import type { Note } from "../../../storage/repositories";
import { IDJSONSchema, IDJSONObjectInstruction } from "../config";
import { LittleAI } from "../../../services/ai";
import { searchNotes } from "../../../popup/records";
import { readNotes, unlockedKeys } from "../records";
import { extractSemanticIds } from "./_utils/extractSemanticIds";
import {
	pickSemanticCandidates,
	quoteForPrompt,
} from "./_utils/semanticSearch";

const toolCall = async (
	ai: Pick<LittleAI, "getStructuredResponse">,
	query: string,
): Promise<Array<Note>> => {
	const notes = await readNotes(await unlockedKeys());
	if (query.trim() === "") {
		return notes;
	}
	const queryNotes = new Set<Note>(searchNotes(notes, query));
	const semanticCandidates = pickSemanticCandidates(
		[...queryNotes],
		notes,
	).map((note) => ({
		id: note.id,
		snippet: note.content.slice(0, 200),
	}));
	const response = await ai.getStructuredResponse(
		`
            Here is a list of notes in JSON format:
            ${JSON.stringify(semanticCandidates)}

            The user's query is: "${quoteForPrompt(query)}".

            Find all relevant ids of notes where the content matches or relates to the query.
        `,
		IDJSONSchema,
		IDJSONObjectInstruction,
	);
	const semanticNoteIds = extractSemanticIds(response);
	notes
		.filter((note) => semanticNoteIds.includes(note.id))
		.forEach((note) => queryNotes.add(note));
	return notes.filter((note) => queryNotes.has(note));
};

export { toolCall as searchNotesToolCall };
