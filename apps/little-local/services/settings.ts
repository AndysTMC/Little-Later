import { LAISettings, LUserSettings } from 'little-shared/types.js';
import config from '../config.js';
import { LINITIAL_USER_SETTINGS } from 'little-shared/constants.js';

export const getUserSettings = (): LUserSettings => {
    const { userSettings } = config;
    return userSettings;
};

export const markGettingStarted = (): void => {
    const currentuserSettings = getUserSettings();
    updateUserSettings({
        ...currentuserSettings,
        guide: {
            ...currentuserSettings.guide,
            isFirstTimeUser: false,
        },
    });
};

export const updateAISettings = (modifiedAISettings: LAISettings): void => {
    const userSettings = getUserSettings();
    updateUserSettings({
        ...userSettings,
        ai: modifiedAISettings,
    });
};

export const updateUserSettings = (userSettings: LUserSettings): void => {
    config.userSettings = userSettings;
};

export const resetUserSettings = (): void => {
    updateUserSettings(LINITIAL_USER_SETTINGS.value);
};
