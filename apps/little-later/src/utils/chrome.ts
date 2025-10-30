import { LCHROME_STORAGE_KEYS } from "little-shared/enums";
import { LChromeStorageRecords } from "little-shared/types";
import { cloneObject } from "little-shared/utils/misc";

export const getChromeStorageRecords = <
	T extends Partial<LChromeStorageRecords>,
>(
	records: T,
): Promise<T> => {
	if (Object.values(records).every((x) => x === undefined)) {
		return new Promise((resolve) => resolve({} as T));
	}
	if (import.meta.env.MODE !== "production") {
		const result: Partial<LChromeStorageRecords> = cloneObject(
			records,
		) as T;

		if (records.littleLocalConfig) {
			const littleLocalConfigString = localStorage.getItem(
				LCHROME_STORAGE_KEYS.LITTLE_LOCAL_CONFIG,
			);
			if (littleLocalConfigString) {
				result.littleLocalConfig = JSON.parse(littleLocalConfigString);
			}
		}

		if (records.userSettings) {
			const userSettingsString = localStorage.getItem(
				LCHROME_STORAGE_KEYS.USER_SETTINGS,
			);
			if (userSettingsString) {
				result.userSettings = JSON.parse(userSettingsString);
			}
		}
		if (records.toasts) {
			const toastsString = localStorage.getItem(
				LCHROME_STORAGE_KEYS.TOASTS,
			);
			if (toastsString) {
				result.toasts = JSON.parse(toastsString);
			}
		}
		return Promise.resolve(result as T);
	}
	return new Promise<T>((resolve, reject) => {
		chrome.storage.local.get(records, (result) => {
			if (chrome.runtime.lastError) {
				console.error(
					"Error getting Chrome storage records:",
					chrome.runtime.lastError,
				);
				reject(chrome.runtime.lastError);
			} else {
				resolve(result as T);
			}
		});
	});
};

export const setChromeStorageRecords = (
	records: Partial<LChromeStorageRecords>,
): Promise<void> => {
	if (import.meta.env.MODE !== "production") {
		if (records.littleLocalConfig) {
			localStorage.setItem(
				LCHROME_STORAGE_KEYS.LITTLE_LOCAL_CONFIG,
				JSON.stringify(records.littleLocalConfig),
			);
		}
		if (records.userSettings) {
			localStorage.setItem(
				LCHROME_STORAGE_KEYS.USER_SETTINGS,
				JSON.stringify(records.userSettings),
			);
		}
		if (records.toasts) {
			localStorage.setItem(
				LCHROME_STORAGE_KEYS.TOASTS,
				JSON.stringify(records.toasts),
			);
		}

		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		chrome.storage.local.set(records, () => {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
			} else {
				resolve();
			}
		});
	});
};

export const getActiveWebDetails = async (): Promise<{
	url: string | undefined;
	title: string | undefined;
}> => {
	let url: string | undefined;
	let title: string | undefined;
	try {
		await getActiveTab().then((tab) => {
			url = tab?.url;
			title = tab?.title;
		});
	} catch {
		url = window.location.href;
		title = window.document.title;
	}
	return { url, title };
};

export const getActiveTab = (): Promise<chrome.tabs.Tab | undefined> => {
	return new Promise((resolve) => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (chrome.runtime.lastError) {
				console.error(
					"Error getting active tab:",
					chrome.runtime.lastError,
				);
				resolve(undefined);
			} else {
				resolve(tabs[0]);
			}
		});
	});
};
