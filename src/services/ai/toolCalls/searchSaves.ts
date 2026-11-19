import type { Save } from "../../../storage/repositories";
import { IDJSONObjectInstruction } from "../config";
import { LittleAI } from "../../../services/ai";
import { searchSaves } from "../../../popup/records";
import { readSaves } from "../records";
import { extractSemanticIds } from "./_utils/extractSemanticIds";
import {
	pickSemanticCandidates,
	quoteForPrompt,
} from "./_utils/semanticSearch";
import type { AIOwner } from "../owner";

const toolCall = async (
	owner: AIOwner,
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
): Promise<Array<Save>> => {
	const saves = (await readSaves(await owner.keys())).filter(
		(save) => save.saved,
	);
	let resultSaves = saves.slice();
	if (query) {
		const querySaves = new Set<Save>(searchSaves(saves, query));
		const savesToSend = pickSemanticCandidates([...querySaves], saves).map(
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
			IDJSONObjectInstruction,
		);
		const semanticSaveIds = extractSemanticIds(response);
		saves
			.filter((save) => semanticSaveIds.includes(save.id))
			.forEach((save) => querySaves.add(save));
		resultSaves = resultSaves.filter((save) => querySaves.has(save));
	}
	if (domain) {
		const normalizedDomain = domain.toLowerCase();
		resultSaves = resultSaves.filter((save) =>
			save.url.toLowerCase().includes(normalizedDomain),
		);
	}
	if (url) {
		resultSaves = resultSaves.filter((save) => save.url === url);
	}
	return resultSaves;
};

export { toolCall as searchSavesToolCall };
