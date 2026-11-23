import { getActiveTab } from "../../../utils/chrome";
import type { AIOwner } from "../owner";
import { readPage } from "../pages";

// Saves the active tab's page (or the page captured when approval was asked).
// Its preview comes with the worker's next capture of the tab, and a best-effort
// offline reader snapshot is captured when the tab is still readable.
const toolCall = async (
	owner: AIOwner,
	target?: { url?: string; title?: string },
): Promise<() => Promise<void>> => {
	return async () => {
		const tab = await getActiveTab();
		const url = target?.url ?? tab?.url;
		const title = target?.title ?? tab?.title ?? "";
		if (!url) {
			throw new Error("Could not save the active page.");
		}
		let snapshot: string | undefined;
		if (tab?.id !== undefined && tab.url === url) {
			try {
				const content = await readPage({
					tabId: tab.id,
					url,
					title,
				});
				if (content.text) {
					snapshot = content.text;
				}
			} catch {
				// Snapshot capture is best-effort.
			}
		}
		await owner.send("save.capture", {
			url,
			title,
			saved: true,
			...(snapshot ? { snapshot } : {}),
		});
	};
};

export { toolCall as saveActiveWebPageToolCall };
