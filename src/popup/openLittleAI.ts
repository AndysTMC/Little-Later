import { inToolbarPopup } from "./ceremonyWindow";

// LittleAI lives in the side panel (decision 0017); the popup's AI button
// opens it. Chrome opens a side panel only in direct answer to a click, so
// the window it goes in is known before the click, and nothing is awaited
// first.
let windowId: number | undefined;
if (typeof chrome !== "undefined" && chrome.windows && chrome.sidePanel) {
	void chrome.windows.getCurrent().then((current) => {
		windowId = current.id;
	});
}

export const openLittleAI = (): void => {
	if (typeof chrome !== "undefined" && chrome.sidePanel) {
		if (windowId !== undefined) {
			void chrome.sidePanel.open({ windowId });
			// The toolbar popup steps aside for the panel.
			if (inToolbarPopup()) window.close();
			return;
		}
		// Clicked before getCurrent() resolved: open in a tab cleanly rather
		// than falling through to a broken panel-mode tab.
		if (chrome.tabs) {
			void chrome.tabs.create({
				url: chrome.runtime.getURL("sidepanel.html?surface=tab"),
			});
			if (inToolbarPopup()) window.close();
			return;
		}
	}
	// Outside the extension (the dev server), the panel's page in a tab.
	window.open("/sidepanel.html?surface=tab", "_blank");
};
