import { LINITIAL_USER_SETTINGS } from "little-shared/constants";
import { LUserSettings } from "little-shared/types";
import {
	getChromeStorageRecords,
	setChromeStorageRecords,
} from "../utils/chrome";

// The first-run guide is shown once per browser, not per profile, so its
// flag is the one setting outside a profile. Everything else lives in the
// profile (decision 0010); the stored `userSettings` keeps its shape with
// default values around the flag.

const guideOnly = (isFirstTimeUser: boolean): LUserSettings => ({
	...LINITIAL_USER_SETTINGS.value,
	guide: { isFirstTimeUser },
});

export const isFirstTimeUser = async (): Promise<boolean> => {
	const { userSettings } = await getChromeStorageRecords({
		userSettings: LINITIAL_USER_SETTINGS.value,
	});
	return userSettings?.guide?.isFirstTimeUser !== false;
};

export const markGettingStarted = (): Promise<void> =>
	setChromeStorageRecords({ userSettings: guideOnly(false) });

// Before format v1, `userSettings` also held the AI provider and its key in
// plain, and `activeUserId` the open profile. Keeps only the guide flag.
export const dropPreV1Settings = async (): Promise<void> => {
	const firstTime = await isFirstTimeUser();
	await chrome.storage.local.remove("activeUserId");
	await setChromeStorageRecords({ userSettings: guideOnly(firstTime) });
};
