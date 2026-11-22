import { getActiveTab } from "../../../utils/chrome";
import type { AIOwner } from "../owner";

// Saves the active tab's page (or the page captured when approval was asked).
// Its preview comes with the worker's next capture of the tab.
const toolCall = async (
	owner: AIOwner,
	target?: { url?: string; title?: string },
): Promise<() => Promise<void>> => {
	return async () => {
		const tab = target?.url ? undefined : await getActiveTab();
		const url = target?.url ?? tab?.url;
		const title = target?.title ?? tab?.title ?? "";
		if (!url) {
			throw new Error("Could not save the active page.");
		}
		await owner.send("save.capture", {
			url,
			title,
			saved: true,
		});
	};
};

export { toolCall as saveActiveWebPageToolCall };
