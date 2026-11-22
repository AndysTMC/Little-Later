export const MAX_IGNORED_DOMAINS = 100;
export const MAX_IGNORED_ENTRY_LENGTH = 200;

// Normalizes a user-entered domain or URL prefix to skip in automatic history.
// Accepts plain hostnames ("localhost", "mail.google.com"), host+path
// ("example.com/private"), or full http(s) URL prefixes.
export const normalizeIgnoredEntry = (raw: string): string => {
	const trimmed = raw.trim().toLowerCase().slice(0, MAX_IGNORED_ENTRY_LENGTH);
	if (trimmed === "") return "";
	if (/^https?:\/\//.test(trimmed)) {
		return trimmed.replace(/\/+$/, "");
	}
	return trimmed.replace(/^\*\./, "").replace(/^\/+|\/+$/g, "");
};

export const normalizeIgnoredDomains = (
	entries: ReadonlyArray<string> | undefined,
): Array<string> => {
	if (!entries || entries.length === 0) return [];
	const seen = new Set<string>();
	const result: Array<string> = [];
	for (const raw of entries) {
		const normalized = normalizeIgnoredEntry(raw);
		if (normalized === "" || seen.has(normalized)) continue;
		seen.add(normalized);
		result.push(normalized);
		if (result.length >= MAX_IGNORED_DOMAINS) break;
	}
	return result;
};

export const isUrlIgnored = (
	url: string,
	ignoredDomains: ReadonlyArray<string> | undefined,
): boolean => {
	if (!ignoredDomains || ignoredDomains.length === 0) {
		return false;
	}
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	const lowerUrl = url.toLowerCase();
	const host = parsed.hostname.toLowerCase();
	const hostAndPath = `${host}${parsed.pathname.toLowerCase()}`;

	for (const entry of ignoredDomains) {
		const pattern = normalizeIgnoredEntry(entry);
		if (pattern === "") continue;
		if (/^https?:\/\//.test(pattern)) {
			if (
				lowerUrl === pattern ||
				lowerUrl.startsWith(`${pattern}/`) ||
				lowerUrl.startsWith(`${pattern}?`)
			) {
				return true;
			}
			continue;
		}
		if (pattern.includes("/")) {
			if (
				hostAndPath === pattern ||
				hostAndPath.startsWith(`${pattern}/`)
			) {
				return true;
			}
			continue;
		}
		if (host === pattern || host.endsWith(`.${pattern}`)) {
			return true;
		}
	}
	return false;
};
