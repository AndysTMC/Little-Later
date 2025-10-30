import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { LUserSettings } from 'little-shared/types';
import { LINITIAL_USER_SETTINGS } from 'little-shared/constants';

type LConfig = {
    port: number;
    userSettings: LUserSettings;
};

const configPath = path.join(app.getPath('userData'), 'config.json');

const defaultConfig: LConfig = {
    port: 3000,
    userSettings: LINITIAL_USER_SETTINGS.value,
};

const readConfig = (): LConfig => {
    try {
        const configFile = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configFile);
        return config;
    } catch (error) {
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig));
        return defaultConfig;
    }
};

const writeConfig = (config: LConfig) => {
    fs.writeFileSync(configPath, JSON.stringify(config));
};

const config: LConfig = {
    get port() {
        return readConfig().port;
    },
    set port(value: number) {
        writeConfig({
            ...this,
            port: value,
        });
    },
    get userSettings() {
        return readConfig().userSettings;
    },
    set userSettings(value: LUserSettings) {
        writeConfig({
            ...this,
            userSettings: value,
        });
    },
};

export default config;
