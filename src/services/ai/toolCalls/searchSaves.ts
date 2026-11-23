import type { Save } from "../../../storage/repositories";
import { normalizeTag } from "../../../utils/tags";
import { IDJSONObjectInstruction } from "../config";
import type { LittleAI } from "../main";
import { searchSaves } from "../../../popup/records";
import { readSaves } from "../records";
import { hybridRank, rrfFuse } from "./_utils/bm25";
import { extractSemanticIds } from "./_utils/extractSemanticIds";
import {
	pickSemanticCandidates,
	quoteForPrompt,
} from "./_utils/semanticSearch";
import type { AIOwner } from "../owner";

const saveSearchText = (save: Save): string =>
	[
		save.customName,
		save.title,
		save.url,
		...(save.tags ?? []),
		save.snapshot?.slice(0, 2_000) ?? "",
	].join(" ");

const toolCall = async (
	owner: AIOwner,
	ai: Pick<LittleAI, "getStructuredResponse">,
	{
		query,
		domain,
		url,
		tag,
	}: {
		query?: string;
		domain?: string;
		url?: string;
		tag?: string;
	},
): Promise<Array<Save>> => {
	const saves = (await readSaves(await owner.keys())).filter(
		(save) => save.saved,
	);
	let resultSaves = saves.slice();
	if (tag && tag.trim() !== "") {
		const normalizedTag = normalizeTag(tag);
		if (normalizedTag) {
			resultSaves = resultSaves.filter((save) =>
				(save.tags ?? []).some(
					(t) => t.toLowerCase() === normalizedTag,
				),
			);
		}
	}
	if (domain) {
		const normalizedDomain = domain
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, "")
			.replace(/\/.*$/, "")
			.replace(/^\.+/, "");
		resultSaves = resultSaves.filter((save) => {
			try {
				const host = new URL(save.url).hostname.toLowerCase();
				return (
					host === normalizedDomain ||
					host.endsWith(`.${normalizedDomain}`)
				);
			} catch {
				return false;
			}
		});
	}
	if (url) {
		resultSaves = resultSaves.filter((save) => save.url === url);
	}
	const trimmedQuery = query?.trim() ?? "";
	if (trimmedQuery && resultSaves.length > 0) {
		const lexicalHits = searchSaves(resultSaves, trimmedQuery);
		const bm25Hits = hybridRank(
			resultSaves,
			trimmedQuery,
			saveSearchText,
		).map((entry) => entry.item);
		const mergedLexical = pickSemanticCandidates(
			bm25Hits,
			lexicalHits,
			resultSaves.length,
		);
		const savesToSend = pickSemanticCandidates(
			mergedLexical,
			resultSaves,
		).map((save) => ({
			id: save.id,
			name: save.customName,
			title: save.title,
			url: save.url,
			tags: save.tags ?? [],
			...(save.snapshot ? { snippet: save.snapshot.slice(0, 200) } : {}),
		}));
		let semanticSaveIds: Array<string> = [];
		try {
			const response = await ai.getStructuredResponse(
				`
                Here is a list of saves in JSON format:
                ${JSON.stringify(savesToSend)}

                The user's query is: "${quoteForPrompt(trimmedQuery)}".

                Find all relevant ids of saves where the name, title, URL, snippet, or tags match or relate to the query.
            `,
				IDJSONObjectInstruction,
			);
			semanticSaveIds = extractSemanticIds(response);
		} catch {
			// Fall back to local BM25 + lexical hits if semantic re-ranking fails.
		}
		const fusedIds = rrfFuse([
			bm25Hits.map((save) => save.id),
			lexicalHits.map((save) => save.id),
			semanticSaveIds,
		]);
		const byId = new Map(resultSaves.map((save) => [save.id, save]));
		resultSaves = fusedIds
			.map((id) => byId.get(id))
			.filter((save): save is Save => save !== undefined);
	}
	return resultSaves;
};

export { toolCall as searchSavesToolCall };
