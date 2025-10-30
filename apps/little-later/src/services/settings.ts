import { LAISettings, LUserSettings } from "little-shared/types";
import {
	getChromeStorageRecords,
	setChromeStorageRecords,
} from "../utils/chrome";
import { LINITIAL_USER_SETTINGS } from "little-shared/constants";
import { localFetch } from "../utils/littleLocal";

export const getUserSettings = async (): Promise<LUserSettings> => {
	const response = await localFetch("/settings");
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	const { userSettings } = await getChromeStorageRecords({
		userSettings: LINITIAL_USER_SETTINGS.value,
	});
	return userSettings;
};

export const markGettingStarted = async (): Promise<void> => {
	const currentuserSettings = await getUserSettings();
	await updateUserSettings({
		...currentuserSettings,
		guide: {
			...currentuserSettings.guide,
			isFirstTimeUser: false,
		},
	});
};

export const updateAISettings = async (
	modifiedAISettings: LAISettings,
): Promise<void> => {
	const userSettings = await getUserSettings();
	await updateUserSettings({
		...userSettings,
		ai: modifiedAISettings,
	});
};

export const updateUserSettings = async (
	userSettings: LUserSettings,
): Promise<void> => {
	const response = await localFetch("/settings", {
		method: "POST",
		body: JSON.stringify({ userSettings }),
		headers: { "Content-Type": "application/json" },
	});
	if (response.use) {
		return;
	}
	await setChromeStorageRecords({
		userSettings,
	});
};

export const resetUserSettings = async (): Promise<void> => {
	await updateUserSettings(LINITIAL_USER_SETTINGS.value);
};
