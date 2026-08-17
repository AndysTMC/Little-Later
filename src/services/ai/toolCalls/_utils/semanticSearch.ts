export const SEMANTIC_CANDIDATE_LIMIT = 20;

export const quoteForPrompt = (value: string): string =>
	value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const pickSemanticCandidates = <T extends { id: number }>(
	lexicalHits: Array<T>,
	allItems: Array<T>,
	limit = SEMANTIC_CANDIDATE_LIMIT,
): Array<T> => {
	const seen = new Set<number>();
	const candidates: Array<T> = [];
	for (const item of [...lexicalHits, ...allItems]) {
		if (seen.has(item.id)) {
			continue;
		}
		seen.add(item.id);
		candidates.push(item);
		if (candidates.length >= limit) {
			break;
		}
	}
	return candidates;
};
