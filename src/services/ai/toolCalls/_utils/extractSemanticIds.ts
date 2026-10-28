// The ids a structured response picked; record ids are strings (0010).
const extractSemanticIds = (response: unknown): Array<string> => {
	if (!response || typeof response !== "object") {
		return [];
	}
	const ids = (response as { ids?: unknown }).ids;
	if (!Array.isArray(ids)) {
		return [];
	}
	return ids.filter((id): id is string => typeof id === "string");
};

export { extractSemanticIds };
