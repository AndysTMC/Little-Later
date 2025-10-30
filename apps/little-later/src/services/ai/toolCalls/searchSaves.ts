import { LVisualBM } from "little-shared/types";
import { IDJSONSchema, IDJSONObjectInstruction } from "../config";
import { LittleAI } from "../../../services/ai";
import { getDBTables } from "../../../utils/db";
import { searchSavesByText } from "../../../utils/visualBM";

const toolCall = async (
	ai: LittleAI,
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
	const saves = visualBMTbl.filter((x) => x.isSaved);
	if (saves === undefined) {
		throw new Error("Something went wrong while fetching saves.");
	}
	let resultSaves: LVisualBM[] = saves.slice();
	if (query) {
		const querySaves: LVisualBM[] = [];
		const filteredSaves = searchSavesByText(saves, query);
		filteredSaves.forEach((save) => {
			if (!querySaves.includes(save)) {
				querySaves.push(save);
			}
		});
		const savesToSend = saves.map((save) => ({
			...save,
			preview: "img",
		}));
		const response = await ai.getStructuredResponse(
			`
                Here is a list of saves in JSON format:
                ${JSON.stringify(savesToSend, null, 2)}

                The user's query is: "${query}".

                Find all relevant ids of saves where the name, domain, or notes (if present) match or relate to the query.
            `,
			IDJSONSchema,
			IDJSONObjectInstruction,
		);
		const symanticSaveIds = (response as { ids: number[] }).ids;
		const symanticSaves = saves.filter((save) =>
			symanticSaveIds.includes(save.id),
		);
		symanticSaves.forEach((save) => {
			if (!querySaves.includes(save)) {
				querySaves.push(save);
			}
		});
		resultSaves = resultSaves.filter((save) => querySaves.includes(save));
	}
	if (domain) {
		const domainFilteredSaves = resultSaves.filter((save) =>
			save.url.includes(domain),
		);
		resultSaves = resultSaves.filter((save) =>
			domainFilteredSaves.includes(save),
		);
	}
	if (url) {
		const urlFilteredSaves = resultSaves.filter((save) => save.url === url);
		resultSaves = resultSaves.concat(
			resultSaves.filter((save) => urlFilteredSaves.includes(save)),
		);
	}
	return resultSaves;
};

export { toolCall as searchSavesToolCall };
