import { LAI_PROVIDERS, LFACE_EXPRESSION, LTOAST_TYPE } from "./enums.js";

export type LToast = {
	id: number;
	message: string;
	type: LTOAST_TYPE;
};

export type LAIConfirmationKind = "mutate" | "destructive" | "external";

export type LAIConfirmationItem = {
	toolName: string;
	summary: string;
	kind: LAIConfirmationKind;
};

export type LAIConfirmation = {
	items: Array<LAIConfirmationItem>;
	requiresPassword: boolean;
};

export type LAIOutput = {
	message: string;
	actions: Array<() => Promise<void> | void>;
	expression: LFACE_EXPRESSION;
	confirmation?: LAIConfirmation;
};

export type LAISettings = {
	provider: LAI_PROVIDERS;
	baseUrl: string;
	apiKey: string;
	model: string;
};

export type LUserSettings = {
	ai: LAISettings;
	guide: {
		isFirstTimeUser: boolean;
	};
	misc: {
		VBMLimit: number;
		VBMSameOriginLimit: number;
	};
};

export type LChromeStorageRecords = {
	userSettings: LUserSettings;
	toasts: Array<LToast>;
	activeUserId: number | null;
};

// The date format the AI tools exchange with the model: a wall-clock time
// with its UTC offset, such as 2026-10-28T09:00:00+05:30.
export type LDate =
	`${number}-${number}-${number}T${number}:${number}:${number}+${number}:${number}`;
