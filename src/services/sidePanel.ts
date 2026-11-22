// Where the extension uses Chrome's side panel:
// - "everything": clicking the toolbar icon opens the full extension in the
//   side panel, and LittleAI opens inline at /ai.
// - "ai": clicking the toolbar icon opens the popup; LittleAI opens in the
//   side panel (sidepanel.html).
// - "none": side panel is disabled; LittleAI opens inline inside the popup
//   at /ai.
export type SidePanelMode = "everything" | "ai" | "none";

export const DEFAULT_SIDE_PANEL_MODE: SidePanelMode = "ai";
export const SIDE_PANEL_STORAGE_KEY = "sidePanelMode";

export const isSidePanelMode = (value: unknown): value is SidePanelMode =>
	value === "everything" || value === "ai" || value === "none";

const listeners = new Set<(mode: SidePanelMode) => void>();

const notifyListeners = (mode: SidePanelMode): void => {
	for (const listener of listeners) {
		listener(mode);
	}
};

const hasChromeLocal = (): boolean =>
	typeof chrome !== "undefined" && Boolean(chrome.storage?.local);

export const getSidePanelMode = async (): Promise<SidePanelMode> => {
	try {
		if (hasChromeLocal()) {
			const result = await chrome.storage.local.get(
				SIDE_PANEL_STORAGE_KEY,
			);
			const raw = result[SIDE_PANEL_STORAGE_KEY];
			return isSidePanelMode(raw) ? raw : DEFAULT_SIDE_PANEL_MODE;
		}
		if (typeof localStorage !== "undefined") {
			const stored = localStorage.getItem(SIDE_PANEL_STORAGE_KEY);
			if (stored !== null) {
				const parsed: unknown = JSON.parse(stored);
				return isSidePanelMode(parsed)
					? parsed
					: DEFAULT_SIDE_PANEL_MODE;
			}
		}
	} catch {
		// Fall back to default when storage cannot be read or parsed.
	}
	return DEFAULT_SIDE_PANEL_MODE;
};

export const applySidePanelMode = async (
	mode: SidePanelMode,
): Promise<void> => {
	if (typeof chrome === "undefined" || !chrome.sidePanel) {
		return;
	}
	try {
		if (mode === "everything") {
			await chrome.sidePanel.setOptions({
				path: "index.html?surface=panel",
				enabled: true,
			});
			await chrome.sidePanel.setPanelBehavior({
				openPanelOnActionClick: true,
			});
		} else if (mode === "ai") {
			await chrome.sidePanel.setPanelBehavior({
				openPanelOnActionClick: false,
			});
			await chrome.sidePanel.setOptions({
				path: "sidepanel.html",
				enabled: true,
			});
		} else {
			await chrome.sidePanel.setPanelBehavior({
				openPanelOnActionClick: false,
			});
			await chrome.sidePanel.setOptions({
				enabled: false,
			});
		}
	} catch (error) {
		console.warn("Could not apply side panel mode.", error);
	}
};

export const setSidePanelMode = async (mode: SidePanelMode): Promise<void> => {
	if (hasChromeLocal()) {
		await chrome.storage.local.set({ [SIDE_PANEL_STORAGE_KEY]: mode });
	} else if (typeof localStorage !== "undefined") {
		localStorage.setItem(SIDE_PANEL_STORAGE_KEY, JSON.stringify(mode));
	}
	await applySidePanelMode(mode);
	notifyListeners(mode);
};

export const subscribeSidePanelMode = (
	listener: (mode: SidePanelMode) => void,
): (() => void) => {
	listeners.add(listener);
	const onChromeChange = (
		changes: Record<string, chrome.storage.StorageChange>,
		areaName: string,
	) => {
		if (areaName !== "local") return;
		const change = changes[SIDE_PANEL_STORAGE_KEY];
		if (change && isSidePanelMode(change.newValue)) {
			listener(change.newValue);
		}
	};
	const onWindowStorage = (event: StorageEvent) => {
		if (event.key !== SIDE_PANEL_STORAGE_KEY || !event.newValue) return;
		try {
			const parsed = JSON.parse(event.newValue);
			if (isSidePanelMode(parsed)) listener(parsed);
		} catch {
			// Ignore malformed storage values.
		}
	};
	const hasChromeStorage =
		typeof chrome !== "undefined" && Boolean(chrome.storage?.onChanged);
	if (hasChromeStorage) {
		chrome.storage.onChanged.addListener(onChromeChange);
	}
	if (typeof window !== "undefined") {
		window.addEventListener("storage", onWindowStorage);
	}
	return () => {
		listeners.delete(listener);
		if (hasChromeStorage) {
			chrome.storage.onChanged.removeListener(onChromeChange);
		}
		if (typeof window !== "undefined") {
			window.removeEventListener("storage", onWindowStorage);
		}
	};
};
