import { LAI_PROVIDERS } from "./enums.js";
import { LUserSettings } from "./types.js";

// Where Ollama and LM Studio listen on this machine by default. A custom
// provider brings its own URL.
export const LLOCAL_AI_BASE_URLS = {
	[LAI_PROVIDERS.OLLAMA]: "http://127.0.0.1:11434/v1",
	[LAI_PROVIDERS.LM_STUDIO]: "http://127.0.0.1:1234/v1",
} as const;

export const LMIN_VBM_LIMIT = 1000;
export const LMAX_VBM_LIMIT = 2000;
export const LMIN_VBM_SAME_ORIGIN_LIMIT = 1;
export const LMAX_VBM_SAME_ORIGIN_LIMIT = 10;

export const LINITIAL_MISC_SETTINGS = {
	get value() {
		return {
			VBMLimit: 1000,
			// More than one, so a second page on a site does not push the
			// first out of history.
			VBMSameOriginLimit: 5,
		};
	},
};

export const LINITIAL_USER_SETTINGS = {
	get value() {
		return {
			ai: {
				provider: LAI_PROVIDERS.OLLAMA,
				baseUrl: LLOCAL_AI_BASE_URLS[LAI_PROVIDERS.OLLAMA],
				apiKey: "",
				model: "",
			},
			guide: {
				isFirstTimeUser: true,
			},
			misc: LINITIAL_MISC_SETTINGS.value,
		} as LUserSettings;
	},
};

export const LMAX_NAME_LENGTH = 20;

export const LMAX_REMINDER_MESSAGE_LENGTH = 256;

export const LMAX_TASK_INFORMATION_LENGTH = 256;

export const LMAX_TASK_LABEL_LENGTH = 20;

export const LNONE = "None";

export const LDATE_FORMAT = "YYYY-MM-DDTHH:mm:ssZ";
