export type OpenTabSummary = {
	title: string;
	url: string;
	active: boolean;
};

const queryFocusedTabs = async (): Promise<Array<chrome.tabs.Tab>> => {
	if (typeof chrome === "undefined" || !chrome.tabs?.query) {
		return [];
	}
	return new Promise<Array<chrome.tabs.Tab>>((resolve) => {
		try {
			const maybePromise = chrome.tabs.query(
				{ lastFocusedWindow: true },
				(tabs) => {
					resolve(Array.isArray(tabs) ? tabs : []);
				},
			) as unknown;
			if (
				maybePromise &&
				typeof (maybePromise as Promise<unknown>).then === "function"
			) {
				(maybePromise as Promise<Array<chrome.tabs.Tab>>)
					.then((tabs) => resolve(Array.isArray(tabs) ? tabs : []))
					.catch(() => resolve([]));
			}
		} catch {
			resolve([]);
		}
	});
};

const toolCall = async (limit = 25): Promise<Array<OpenTabSummary>> => {
	const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
	const tabs = await queryFocusedTabs();
	const results: Array<OpenTabSummary> = [];
	for (const tab of tabs) {
		if (tab.incognito || !tab.url || !/^https?:\/\//i.test(tab.url)) {
			continue;
		}
		results.push({
			title: (tab.title ?? tab.url).slice(0, 160),
			url: tab.url.slice(0, 500),
			active: Boolean(tab.active),
		});
		if (results.length >= safeLimit) {
			break;
		}
	}
	return results;
};

export { toolCall as readOpenTabsToolCall };
