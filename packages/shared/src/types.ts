import {
	LAI_PROVIDERS,
	LFACE_EXPRESSION,
	LHOME_MAIN_CONTENT,
	LTOAST_TYPE,
} from "./enums.js";

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

export type LAIVerbosity = "concise" | "balanced" | "detailed";

export type LAIPreset = {
	id: string;
	name: string;
	provider: LAI_PROVIDERS;
	baseUrl: string;
	apiKey: string;
	model: string;
};

export type LAIMemory = {
	id: string;
	text: string;
	createdAt: number;
};

export type LExternalMcpMode = "off" | "read" | "write";

export type LAISettings = {
	provider: LAI_PROVIDERS;
	baseUrl: string;
	apiKey: string;
	model: string;
	instructions?: string;
	verbosity?: LAIVerbosity;
	presets?: Array<LAIPreset>;
	memories?: Array<LAIMemory>;
	mcpServerUrl?: string;
};

export type LUserSettings = {
	ai: LAISettings;
	guide: {
		isFirstTimeUser: boolean;
	};
	misc: {
		VBMLimit: number;
		VBMSameOriginLimit: number;
		defaultHomeTab?: LHOME_MAIN_CONTENT;
		ignoredDomains?: Array<string>;
		backupReminderDays?: number;
		lastBackupAt?: number;
		chatRetentionDays?: number;
		externalMcpMode?: LExternalMcpMode;
		externalMcpAllowHistory?: boolean;
		externalMcpAllowDelete?: boolean;
	};
};

export type LChromeStorageRecords = {
	userSettings: LUserSettings;
	toasts: Array<LToast>;
};

// The date format the AI tools exchange with the model: a wall-clock time
// with its UTC offset, such as 2026-10-28T09:00:00+05:30.
export type LDate =
	`${number}-${number}-${number}T${number}:${number}:${number}${"+" | "-"}${number}:${number}`;
