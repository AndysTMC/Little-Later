import { LUserSettings } from "little-shared/types";
import { useEffect, useState } from "react";
import { getUserSettings } from "../../services/settings";
import { useLocalSocket } from "./useLocalSocket";

const useCurrentUserSettings = (): LUserSettings | undefined => {
	const [result, setResult] = useState<LUserSettings | undefined>();

	const socket = useLocalSocket();

	useEffect(() => {
		socket?.on("userSettingsChange", () => {
			getUserSettings().then((settings) => setResult(settings));
		});
		return () => {
			socket?.off("userSettingsChange");
		};
	}, [socket]);

	useEffect(() => {
		getUserSettings().then((settings) => setResult(settings));
	}, []);

	useEffect(() => {
		if (import.meta.env.MODE !== "production") return;
		const listener = () => {
			getUserSettings().then((settings) => setResult(settings));
		};
		chrome.storage.onChanged.addListener(listener);
		return () => {
			chrome.storage.onChanged.removeListener(listener);
		};
	}, [setResult, socket]);
	return result;
};

export { useCurrentUserSettings };
