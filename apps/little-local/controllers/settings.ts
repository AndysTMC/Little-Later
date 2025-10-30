import { Request, Response } from 'express';
import { getUserSettings, updateUserSettings } from '../services/settings';
import { LUserSettings } from 'little-shared/types';
import { appEmitter } from '../emitter';
import { DB_CHANGE_KEYS } from '../enums';

export const getUserSettingsEP = async (req: Request, res: Response) => {
    const userSettings = getUserSettings();
    if (userSettings) {
        res.status(200).json(userSettings);
    } else {
        res.status(404).send('User settings not found');
    }
};

export const updateUserSettingsEP = async (req: Request, res: Response) => {
    const { userSettings } = req.body as { userSettings: LUserSettings };
    if (!userSettings) {
        return res.status(400).send('Settings data is required');
    }
    updateUserSettings(userSettings);
    res.sendStatus(204);
    appEmitter.emit(DB_CHANGE_KEYS.userSettingsChange);
};
