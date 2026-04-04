import { getToasts } from "../../services/toasts";
import { LToast } from "little-shared/types";
import { useEffect, useState } from "react";

const useToasts = (): Array<LToast> => {
	const [toasts, setToasts] = useState<Array<LToast>>([]);
	useEffect(() => {
		if (import.meta.env.MODE === "test") return;
		getToasts().then((toasts) => {
			setToasts(toasts);
		});
	}, []);
	useEffect(() => {
		if (import.meta.env.MODE !== "production") return;
		const listener = (changes: {
			[key: string]: chrome.storage.StorageChange;
		}) => {
			if (changes["toasts"] && changes["toasts"].newValue) {
				setToasts(changes["toasts"].newValue as Array<LToast>);
			}
		};
		chrome.storage.onChanged.addListener(listener);
		return () => {
			chrome.storage.onChanged.removeListener(listener);
		};
	}, []);
	return toasts;
};

export { useToasts };
