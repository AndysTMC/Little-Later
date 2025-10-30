import { LAI_PROVIDERS } from './enums.js';
import { LDB, LUserSettings, LVaultDataPostDecryptTables } from './types.js';

export const LCHAR_LIST = 'abcdefghijklmnopqrstuvwxyz0123456789';

export const LEMPTY_CURRENT_USER_PROFILE = null;

export const LTIME_LANGUAGE = 'en';

export const LDATE_LANGUAGE = 'en';

export const LEMPTY_PASSWORD = 'EMPTY_PASSWORD';

export const LLOCAL_CONFIG_STORAGE_KEY = 'little_local_config';

export const LINITIAL_LL_CONFIG = {
    get value() {
        return {
            isEnabled: false,
            port: 3000,
        };
    },
};

export const LEMPTY_VAULT_DATA_POST_DECRYPT = {
    get value(): LVaultDataPostDecryptTables {
        return {
            linkTbl: [],
            noteTbl: [],
            reminderTbl: [],
            taskTbl: [],
            vbmPreviewTbl: [],
            visualBMTbl: [],
        };
    },
};

export const LMIN_VBM_LIMIT = 1000;
export const LMAX_VBM_LIMIT = 2000;
export const LMIN_VBM_SAME_ORIGIN_LIMIT = 1;
export const LMAX_VBM_SAME_ORIGIN_LIMIT = 10;

export const LINITIAL_MISC_SETTINGS = {
    get value() {
        return {
            VBMLimit: 1000,
            VBMSameOriginLimit: 1,
        };
    },
};

export const LINITIAL_USER_SETTINGS = {
    get value() {
        return {
            ai: {
                assist: {
                    provider: LAI_PROVIDERS.GROQ,
                    apiKey: '',
                    model: '',
                },
                rephrase: {
                    provider: LAI_PROVIDERS.CHROME_AI,
                },
                generate: {
                    provider: LAI_PROVIDERS.CHROME_AI,
                },
                summarize: {
                    provider: LAI_PROVIDERS.CHROME_AI,
                },
            },
            guide: {
                isFirstTimeUser: true,
            },
            misc: LINITIAL_MISC_SETTINGS.value,
        } as LUserSettings;
    },
};

export const LEMPTY_DB = {
    get value(): LDB {
        return {
            linkTbl: [],
            noteTbl: [],
            reminderTbl: [],
            taskTbl: [],
            userProfileTbl: [],
            userSettingsTbl: [],
            userVaultTbl: [],
            vbmPreviewTbl: [],
            visualBMTbl: [],
        };
    },
};

export const LID_LENGTH = 16;

export const LMAX_NAME_LENGTH = 20;

export const LMAX_REMINDER_MESSAGE_LENGTH = 256;

export const LMAX_TASK_INFORMATION_LENGTH = 256;

export const LMAX_TASK_LABEL_LENGTH = 20;

export const LNONE = 'None';

export const LNOTIFY_THRESHOLD_MINUTES = 15;

export const LSAVE_NOTE_LENGTH = 256;

export const LTIME_FORMAT = 'HH:mm:ssZ';

export const LDATE_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ';

export const BASE_LL_URL = 'http://localhost:';
