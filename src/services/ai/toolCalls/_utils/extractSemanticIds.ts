const extractSemanticIds = (response: unknown): Array<number> => {
	if (!response || typeof response !== "object") {
		return [];
	}
	const ids = (response as { ids?: unknown }).ids;
	if (!Array.isArray(ids)) {
		return [];
	}
	return ids
		.map((id) => {
			if (typeof id === "number") {
				return Number.isFinite(id) ? id : null;
			}
			if (typeof id === "string") {
				const parsedId = Number.parseInt(id, 10);
				return Number.isFinite(parsedId) ? parsedId : null;
			}
			return null;
		})
		.filter((id): id is number => id !== null);
};

export { extractSemanticIds };
