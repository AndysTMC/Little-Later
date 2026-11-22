import type { Note } from "../../../storage/repositories";
import { IDJSONObjectInstruction } from "../config";
import type { LittleAI } from "../main";
import { searchNotes } from "../../../popup/records";
import { readNotes } from "../records";
import { hybridRank, rrfFuse } from "./_utils/bm25";
import { extractSemanticIds } from "./_utils/extractSemanticIds";
import {
	pickSemanticCandidates,
	quoteForPrompt,
} from "./_utils/semanticSearch";
import type { AIOwner } from "../owner";

const noteSearchText = (note: Note): string =>
	[note.title ?? "", note.content, ...(note.tags ?? [])].join(" ");

const toolCall = async (
	owner: AIOwner,
	ai: Pick<LittleAI, "getStructuredResponse">,
	query: string,
	tag?: string,
): Promise<Array<Note>> => {
	let notes = await readNotes(await owner.keys());
	if (tag && tag.trim() !== "") {
		const normalizedTag = tag.trim().toLowerCase().replace(/^#/, "");
		notes = notes.filter((note) =>
			(note.tags ?? []).some((t) => t.toLowerCase() === normalizedTag),
		);
	}
	if (query.trim() === "" || notes.length === 0) {
		return notes;
	}
	const lexicalHits = searchNotes(notes, query);
	const bm25Hits = hybridRank(notes, query, noteSearchText).map(
		(entry) => entry.item,
	);
	const mergedLexical = pickSemanticCandidates(
		bm25Hits,
		lexicalHits,
		notes.length,
	);
	const semanticCandidates = pickSemanticCandidates(mergedLexical, notes).map(
		(note) => ({
			id: note.id,
			title: note.title ?? "",
			tags: note.tags ?? [],
			snippet: note.content.slice(0, 200),
		}),
	);
	const response = await ai.getStructuredResponse(
		`
            Here is a list of notes in JSON format:
            ${JSON.stringify(semanticCandidates)}

            The user's query is: "${quoteForPrompt(query)}".

            Find all relevant ids of notes where the content, title, or tags match or relate to the query.
        `,
		IDJSONObjectInstruction,
	);
	const semanticNoteIds = extractSemanticIds(response);
	const fusedIds = rrfFuse([
		bm25Hits.map((note) => note.id),
		lexicalHits.map((note) => note.id),
		semanticNoteIds,
	]);
	const byId = new Map(notes.map((note) => [note.id, note]));
	return fusedIds
		.map((id) => byId.get(id))
		.filter((note): note is Note => note !== undefined);
};

export { toolCall as searchNotesToolCall };
