import { LVisualBM } from "little-shared/types";
import { IDJSONSchema, IDJSONObjectInstruction } from "../config";
import { LittleAI } from "../../../services/ai";
import { getDBTables } from "../../../utils/db";
import { searchSavesByText } from "../../../utils/visualBM";
import { extractSemanticIds } from "./_utils/extractSemanticIds";
import {
	pickSemanticCandidates,
	quoteForPrompt,
} from "./_utils/semanticSearch";

const toolCall = async (
	ai: Pick<LittleAI, "getStructuredResponse">,
	{
		query,
		domain,
		url,
	}: {
		query?: string;
		domain?: string;
		url?: string;
	},
): Promise<LVisualBM[]> => {
	const { visualBMTbl } = await getDBTables(["visualBMTbl"]);
	if (visualBMTbl === undefined) {
		throw new Error("Something went wrong while fetching saves.");
	}
	const saves = visualBMTbl.filter((x) => x.isSaved);
	let resultSaves: LVisualBM[] = saves.slice();
	if (query) {
		const querySaves: LVisualBM[] = [];
		const filteredSaves = searchSavesByText(saves, query);
		filteredSaves.forEach((save) => {
			if (!querySaves.includes(save)) {
				querySaves.push(save);
			}
		});
		const savesToSend = pickSemanticCandidates(querySaves, saves).map(
			(save) => ({
				id: save.id,
				name: save.customName,
				title: save.title,
				url: save.url,
			}),
		);
		const response = await ai.getStructuredResponse(
			`
                Here is a list of saves in JSON format:
                ${JSON.stringify(savesToSend)}

                The user's query is: "${quoteForPrompt(query)}".

                Find all relevant ids of saves where the name, domain, or notes (if present) match or relate to the query.
            `,
			IDJSONSchema,
			IDJSONObjectInstruction,
		);
		const semanticSaveIds = extractSemanticIds(response);
		const semanticSaves = saves.filter((save) =>
			semanticSaveIds.includes(save.id),
		);
		semanticSaves.forEach((save) => {
			if (!querySaves.includes(save)) {
				querySaves.push(save);
			}
		});
		resultSaves = resultSaves.filter((save) => querySaves.includes(save));
	}
	if (domain) {
		const normalizedDomain = domain.toLowerCase();
		const domainFilteredSaves = resultSaves.filter((save) =>
			save.url.toLowerCase().includes(normalizedDomain),
		);
		resultSaves = resultSaves.filter((save) =>
			domainFilteredSaves.includes(save),
		);
	}
	if (url) {
		resultSaves = resultSaves.filter((save) => save.url === url);
	}
	return resultSaves;
};

export { toolCall as searchSavesToolCall };
