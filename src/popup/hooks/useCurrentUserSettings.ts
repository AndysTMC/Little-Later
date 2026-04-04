import { LUserSettings } from "little-shared/types";
import { useEffect, useState } from "react";
import { getUserSettings } from "../../services/settings";

const useCurrentUserSettings = (): LUserSettings | undefined => {
	const [result, setResult] = useState<LUserSettings | undefined>();

	useEffect(() => {
		getUserSettings().then((settings) => setResult(settings));
	}, []);

	useEffect(() => {
		if (import.meta.env.MODE !== "production") {
			return;
		}
		const listener = () => {
			getUserSettings().then((settings) => setResult(settings));
		};
		chrome.storage.onChanged.addListener(listener);
		return () => {
			chrome.storage.onChanged.removeListener(listener);
		};
	}, []);

	return result;
};

export { useCurrentUserSettings };
