export const MAX_TAG_LENGTH = 24;
export const MAX_TAGS_PER_RECORD = 15;

// Normalizes a user-entered tag: strips leading `#`, collapses whitespace to
// single hyphens, lowercases, and enforces max length. Returns empty string if
// nothing usable remains.
export const normalizeTag = (raw: string): string =>
	raw
		.trim()
		.replace(/^#+/, "")
		.trim()
		.replace(/\s+/g, "-")
		.toLowerCase()
		.slice(0, MAX_TAG_LENGTH)
		.replace(/-+$/, "");

export const normalizeTags = (
	tags: ReadonlyArray<string> | undefined,
): Array<string> => {
	if (!tags || tags.length === 0) {
		return [];
	}
	const seen = new Set<string>();
	const result: Array<string> = [];
	for (const raw of tags) {
		const normalized = normalizeTag(raw);
		if (normalized === "" || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		result.push(normalized);
		if (result.length >= MAX_TAGS_PER_RECORD) {
			break;
		}
	}
	return result;
};

export const collectProfileTags = (
	collections: ReadonlyArray<ReadonlyArray<{ tags?: ReadonlyArray<string> }>>,
): Array<string> => {
	const counts = new Map<string, number>();
	for (const records of collections) {
		for (const record of records) {
			for (const tag of record.tags ?? []) {
				counts.set(tag, (counts.get(tag) ?? 0) + 1);
			}
		}
	}
	return Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([tag]) => tag);
};

export const recordMatchesTagWord = (
	tags: ReadonlyArray<string> | undefined,
	word: string,
): boolean => {
	if (!tags || tags.length === 0) {
		return false;
	}
	const cleaned = word.trim().replace(/^#+/, "").toLowerCase();
	if (cleaned === "") {
		return false;
	}
	return tags.some((tag) => tag.includes(cleaned));
};
