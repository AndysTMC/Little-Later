import { LINITIAL_LL_CONFIG } from "little-shared/constants";
import { getLLConfig } from "../../utils/littleLocal";
import { LittleLocalConfig } from "little-shared/types";
import { useEffect, useState } from "react";

const useLLConfig = (): LittleLocalConfig => {
	const [llConfig, setLLConfig] = useState<LittleLocalConfig>(
		LINITIAL_LL_CONFIG.value,
	);
	useEffect(() => {
		if (import.meta.env.MODE === "test") return;
		getLLConfig().then((config) => {
			setLLConfig(config);
		});
	}, []);
	useEffect(() => {
		if (import.meta.env.MODE !== "production") return;
		const listener = (changes: {
			[key: string]: chrome.storage.StorageChange;
		}) => {
			if (
				changes["littleLocalConfig"] &&
				changes["littleLocalConfig"].newValue
			) {
				setLLConfig(
					changes["littleLocalConfig"].newValue as LittleLocalConfig,
				);
			}
		};
		chrome.storage.onChanged.addListener(listener);
		return () => {
			chrome.storage.onChanged.removeListener(listener);
		};
	}, []);
	return llConfig;
};

export { useLLConfig };
