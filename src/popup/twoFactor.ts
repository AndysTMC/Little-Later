// Shared by the two-factor unlock pages (decision 0015).

export const TWO_FACTOR_ROUTE = "/settings/security/two-factor";

// When a key was added, as its row and its confirm page show it:
// "19 Nov 2026".
export const addedOn = (when: number): string =>
	new Date(when).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
