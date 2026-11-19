import { getActiveTab } from "../../../utils/chrome";
import type { AIOwner } from "../owner";

// Saves the active tab's page. Its preview comes with the worker's next
// capture of the tab.
const toolCall = async (owner: AIOwner): Promise<() => Promise<void>> => {
	return async () => {
		const tab = await getActiveTab();
		if (!tab?.url) {
			throw new Error("Could not save the active page.");
		}
		await owner.send("save.capture", {
			url: tab.url,
			title: tab.title ?? "",
			saved: true,
		});
	};
};

export { toolCall as saveActiveWebPageToolCall };
