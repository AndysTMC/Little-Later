import { getActiveTab } from "../../../utils/chrome";
import { send } from "../../../utils/send";

// Saves the active tab's page. Its preview comes with the worker's next
// capture of the tab.
const toolCall = async (): Promise<() => Promise<void>> => {
	return async () => {
		const tab = await getActiveTab();
		if (!tab?.url) {
			throw new Error("Could not save the active page.");
		}
		await send("save.capture", {
			url: tab.url,
			title: tab.title ?? "",
			saved: true,
		});
	};
};

export { toolCall as saveActiveWebPageToolCall };
