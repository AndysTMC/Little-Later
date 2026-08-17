import { getToasts } from "../../services/toasts";
import { LToast } from "little-shared/types";
import { useEffect, useState } from "react";

const useToasts = (): Array<LToast> => {
	const [toasts, setToasts] = useState<Array<LToast>>([]);
	useEffect(() => {
		if (import.meta.env.MODE === "test") return;
		void getToasts().then((nextToasts) => {
			setToasts(nextToasts);
		});

		const refreshToasts = () => {
			void getToasts().then((nextToasts) => {
				setToasts(nextToasts);
			});
		};

		window.addEventListener("little-storage-change", refreshToasts);

		const chromeListener = (changes: {
			[key: string]: chrome.storage.StorageChange;
		}) => {
			if (changes.toasts?.newValue) {
				setToasts(changes.toasts.newValue as Array<LToast>);
			}
		};
		if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
			chrome.storage.onChanged.addListener(chromeListener);
		}

		return () => {
			window.removeEventListener("little-storage-change", refreshToasts);
			if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
				chrome.storage.onChanged.removeListener(chromeListener);
			}
		};
	}, []);
	return toasts;
};

export { useToasts };
