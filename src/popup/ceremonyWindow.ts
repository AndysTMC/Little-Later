// The toolbar popup closes when it loses focus, and a security key or
// passkey prompt takes focus. So a ceremony started from the toolbar popup
// runs in a small window of its own, at the same page; anywhere else (a
// tab, that window, the dev server) it runs in place.

export const inToolbarPopup = (): boolean => {
	try {
		return (
			typeof chrome !== "undefined" &&
			typeof chrome.extension?.getViews === "function" &&
			chrome.extension.getViews({ type: "popup" }).includes(window)
		);
	} catch {
		return false;
	}
};

// The popup's own size (src/popup/index.css). A window's size includes its
// title bar and borders, so the window is sized to show exactly this.
const PAGE_WIDTH = 500;
const PAGE_HEIGHT = 600;

// Run once in every page: a ceremony window resizes itself so the page
// inside is the popup's size, whatever the system's window frame is.
export const fitCeremonyWindow = async (): Promise<void> => {
	if (typeof chrome === "undefined" || !chrome.windows) return;
	try {
		const current = await chrome.windows.getCurrent();
		if (current.type !== "popup" || current.id === undefined) return;
		await chrome.windows.update(current.id, {
			width: PAGE_WIDTH + (window.outerWidth - window.innerWidth),
			height: PAGE_HEIGHT + (window.outerHeight - window.innerHeight),
		});
	} catch {
		// Sizing is a nicety; the page scrolls if it is off.
	}
};

// Opens `route` (a hash route, such as "/unlock/<id>") in its own window.
export const openCeremonyWindow = async (route: string): Promise<void> => {
	await chrome.windows.create({
		url: `${chrome.runtime.getURL("index.html")}#${route}`,
		type: "popup",
		// Corrected by fitCeremonyWindow once the page knows its frame.
		width: PAGE_WIDTH,
		height: PAGE_HEIGHT,
		focused: true,
	});
	window.close();
};

// After the ceremony: back to the toolbar popup where Chrome allows it,
// and this window closes either way. Outside a ceremony window, nothing.
export const finishCeremonyWindow = async (): Promise<boolean> => {
	if (typeof chrome === "undefined" || !chrome.windows) return false;
	const current = await chrome.windows.getCurrent();
	if (current.type !== "popup") return false;
	try {
		await chrome.action.openPopup();
	} catch {
		// Not allowed here; the user opens it from the toolbar.
	}
	window.close();
	return true;
};
