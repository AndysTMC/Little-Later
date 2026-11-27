// Pages LittleAI opens in a tab, such as AI settings when opened from the
// standalone side panel.

const openTab = (path: string) => {
	if (typeof chrome !== "undefined" && chrome.tabs) {
		void chrome.tabs.create({ url: chrome.runtime.getURL(path) });
	} else {
		window.open(`/${path}`, "_blank");
	}
};

export const openAISettings = () =>
	openTab("index.html?surface=tab#/settings/ai");

export const openAIProviderSettings = () =>
	openTab("index.html?surface=tab#/settings/ai/provider");

export const openAIMcpSettings = () =>
	openTab("index.html?surface=tab#/settings/ai/mcp");
