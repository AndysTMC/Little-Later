import { getActiveTab } from "../../../utils/chrome";
import type { AIOwner } from "../owner";
import { readArticleSnapshot } from "../pages";

// Saves the active tab's page (or the page captured when approval was asked).
// Private/incognito tabs are never saved automatically.
const toolCall = async (
	owner: AIOwner,
	target?: { url?: string; title?: string },
): Promise<() => Promise<void>> => {
	return async () => {
		const tab = await getActiveTab();
		if (!target?.url && tab?.incognito) {
			throw new Error("Incognito pages cannot be saved automatically.");
		}
		const url = target?.url ?? tab?.url;
		const title = target?.title ?? tab?.title ?? "";
		if (!url) {
			throw new Error("Could not save the active page.");
		}
		const snapshot =
			tab?.id !== undefined && !tab.incognito && tab.url === url
				? await readArticleSnapshot(tab.id, url)
				: undefined;
		await owner.send("save.capture", {
			url,
			title,
			saved: true,
			...(snapshot ? { snapshot } : {}),
		});
	};
};

export { toolCall as saveActiveWebPageToolCall };
