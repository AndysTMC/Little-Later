// Zero-dependency local BM25 + character-trigram ranking and Reciprocal Rank
// Fusion (RRF) over decrypted in-memory records.

const WORD_RE = /[\p{L}\p{N}_-]+/gu;

export const tokenize = (text: string): Array<string> => {
	const matches = text.toLowerCase().match(WORD_RE);
	return matches ? matches.filter((token) => token.length > 0) : [];
};

const trigramsOf = (text: string): Set<string> => {
	const normalized = ` ${text.toLowerCase().replace(/\s+/g, " ").trim()} `;
	const grams = new Set<string>();
	if (normalized.length < 3) {
		if (normalized.trim() !== "") grams.add(normalized.trim());
		return grams;
	}
	for (let i = 0; i <= normalized.length - 3; i++) {
		grams.add(normalized.slice(i, i + 3));
	}
	return grams;
};

export const trigramSimilarity = (a: string, b: string): number => {
	const left = trigramsOf(a);
	const right = trigramsOf(b);
	if (left.size === 0 || right.size === 0) return 0;
	let intersection = 0;
	for (const gram of left) {
		if (right.has(gram)) intersection += 1;
	}
	const union = left.size + right.size - intersection;
	return union === 0 ? 0 : intersection / union;
};

export type RankedItem<T> = {
	item: T;
	score: number;
};

export const bm25Rank = <T>(
	items: ReadonlyArray<T>,
	query: string,
	getText: (item: T) => string,
	k1 = 1.5,
	b = 0.75,
): Array<RankedItem<T>> => {
	const queryTokens = Array.from(new Set(tokenize(query)));
	if (queryTokens.length === 0 || items.length === 0) {
		return [];
	}

	const docs = items.map((item) => {
		const tokens = tokenize(getText(item));
		const freqs = new Map<string, number>();
		for (const token of tokens) {
			freqs.set(token, (freqs.get(token) ?? 0) + 1);
		}
		return { item, length: tokens.length, freqs };
	});

	const totalLength = docs.reduce((sum, doc) => sum + doc.length, 0);
	const avgDocLen = totalLength / docs.length || 1;
	const docCount = docs.length;

	const docFreq = new Map<string, number>();
	for (const token of queryTokens) {
		let count = 0;
		for (const doc of docs) {
			if (doc.freqs.has(token)) count += 1;
		}
		docFreq.set(token, count);
	}

	const ranked: Array<RankedItem<T>> = [];
	for (const doc of docs) {
		let score = 0;
		for (const token of queryTokens) {
			const tf = doc.freqs.get(token) ?? 0;
			if (tf === 0) continue;
			const df = docFreq.get(token) ?? 0;
			const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
			const denom = tf + k1 * (1 - b + (b * doc.length) / avgDocLen);
			score += idf * ((tf * (k1 + 1)) / denom);
		}
		if (score > 0) {
			ranked.push({ item: doc.item, score });
		}
	}

	ranked.sort((a, b) => b.score - a.score);
	return ranked;
};

export const hybridRank = <T>(
	items: ReadonlyArray<T>,
	query: string,
	getText: (item: T) => string,
): Array<RankedItem<T>> => {
	const trimmed = query.trim();
	if (trimmed === "" || items.length === 0) {
		return [];
	}
	const lowerQuery = trimmed.toLowerCase();
	const bm25Scores = new Map<T, number>();
	for (const entry of bm25Rank(items, trimmed, getText)) {
		bm25Scores.set(entry.item, entry.score);
	}

	const ranked: Array<RankedItem<T>> = [];
	for (const item of items) {
		const text = getText(item);
		const lowerText = text.toLowerCase();
		const bm25 = bm25Scores.get(item) ?? 0;
		const exactBonus = lowerText.includes(lowerQuery) ? 1.25 : 0;
		const tri =
			lowerQuery.length >= 4
				? trigramSimilarity(lowerQuery, lowerText.slice(0, 400))
				: 0;
		const fuzzyBonus = tri >= 0.16 ? tri * 1.5 : 0;
		const score = bm25 + exactBonus + fuzzyBonus;
		if (score > 0) {
			ranked.push({ item, score });
		}
	}

	ranked.sort((a, b) => b.score - a.score);
	return ranked;
};

export const rrfFuse = (
	rankedLists: ReadonlyArray<ReadonlyArray<string>>,
	k = 60,
): Array<string> => {
	const scores = new Map<string, number>();
	for (const list of rankedLists) {
		const seen = new Set<string>();
		let rank = 0;
		for (const id of list) {
			if (seen.has(id)) continue;
			seen.add(id);
			rank += 1;
			scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
		}
	}
	return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
};
