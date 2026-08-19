import { LUserSettings } from "little-shared/types";
import { useEffect, useState } from "react";
import { getUserSettings } from "../../services/settings";

const useCurrentUserSettings = (): LUserSettings | undefined => {
	const [result, setResult] = useState<LUserSettings | undefined>();

	useEffect(() => {
		const refresh = () => {
			void getUserSettings().then((settings) => setResult(settings));
		};
		refresh();

		window.addEventListener("little-storage-change", refresh);
		const chromeListener = () => {
			refresh();
		};
		if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
			chrome.storage.onChanged.addListener(chromeListener);
		}

		return () => {
			window.removeEventListener("little-storage-change", refresh);
			if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
				chrome.storage.onChanged.removeListener(chromeListener);
			}
		};
	}, []);

	return result;
};

export { useCurrentUserSettings };
