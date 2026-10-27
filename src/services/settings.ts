import { LAISettings, LUserSettings } from "little-shared/types";
import { LAI_PROVIDERS } from "little-shared/enums";
import {
	getChromeStorageRecords,
	setChromeStorageRecords,
} from "../utils/chrome";
import {
	LINITIAL_USER_SETTINGS,
	LMAX_VBM_LIMIT,
	LMAX_VBM_SAME_ORIGIN_LIMIT,
	LMIN_VBM_LIMIT,
	LMIN_VBM_SAME_ORIGIN_LIMIT,
} from "little-shared/constants";
import { getDefaultBaseUrl } from "./ai/config";

const toString = (value: unknown): string =>
	typeof value === "string" ? value : "";

const getProviderFromLegacyAI = (value: unknown): LAI_PROVIDERS => {
	if (value === LAI_PROVIDERS.OLLAMA) {
		return LAI_PROVIDERS.OLLAMA;
	}
	if (value === LAI_PROVIDERS.LM_STUDIO) {
		return LAI_PROVIDERS.LM_STUDIO;
	}
	if (value === LAI_PROVIDERS.CUSTOM) {
		return LAI_PROVIDERS.CUSTOM;
	}
	// Preserve old Groq users by mapping to Custom (OpenAI-compatible endpoint).
	if (value === "Groq") {
		return LAI_PROVIDERS.CUSTOM;
	}
	return LINITIAL_USER_SETTINGS.value.ai.provider;
};

const getBaseUrlFromLegacyAI = (
	legacyAI: unknown,
	provider: LAI_PROVIDERS,
): string => {
	if (legacyAI && typeof legacyAI === "object" && "baseUrl" in legacyAI) {
		const directBaseUrl = toString(
			(legacyAI as { baseUrl?: unknown }).baseUrl,
		);
		if (directBaseUrl.trim() !== "") {
			return directBaseUrl;
		}
	}

	// Handle previous nested shape: ai.assist.provider/apiKey/model.
	if (
		legacyAI &&
		typeof legacyAI === "object" &&
		"assist" in legacyAI &&
		(legacyAI as { assist?: unknown }).assist &&
		typeof (legacyAI as { assist?: unknown }).assist === "object"
	) {
		const legacyAssist = (legacyAI as { assist: { provider?: unknown } })
			.assist;
		if (legacyAssist.provider === "Groq") {
			return "https://api.groq.com/openai/v1";
		}
	}

	return getDefaultBaseUrl(provider);
};

const normalizeAISettings = (value: unknown): LAISettings => {
	const defaultAISettings = LINITIAL_USER_SETTINGS.value.ai;

	if (!value || typeof value !== "object") {
		return defaultAISettings;
	}

	const provider = getProviderFromLegacyAI(
		(value as { provider?: unknown }).provider ??
			(value as { assist?: { provider?: unknown } }).assist?.provider,
	);

	const baseUrl = getBaseUrlFromLegacyAI(value, provider);

	const apiKey = toString(
		(value as { apiKey?: unknown }).apiKey ??
			(value as { assist?: { apiKey?: unknown } }).assist?.apiKey,
	);
	const model = toString(
		(value as { model?: unknown }).model ??
			(value as { assist?: { model?: unknown } }).assist?.model,
	);

	return {
		provider,
		baseUrl,
		apiKey: apiKey === "ll-local-key" ? "" : apiKey,
		model,
	};
};

const clampInt = (
	value: unknown,
	min: number,
	max: number,
	fallback: number,
): number => {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number.parseInt(value, 10)
				: Number.NaN;
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

export const normalizeUserSettings = (value: unknown): LUserSettings => {
	const defaults = LINITIAL_USER_SETTINGS.value;
	if (!value || typeof value !== "object") {
		return defaults;
	}
	const raw = value as {
		ai?: unknown;
		guide?: { isFirstTimeUser?: unknown };
		misc?: { VBMLimit?: unknown; VBMSameOriginLimit?: unknown };
	};
	return {
		ai: normalizeAISettings(raw.ai),
		guide: {
			isFirstTimeUser:
				raw.guide?.isFirstTimeUser === false ? false : true,
		},
		misc: {
			VBMLimit: clampInt(
				raw.misc?.VBMLimit,
				LMIN_VBM_LIMIT,
				LMAX_VBM_LIMIT,
				defaults.misc.VBMLimit,
			),
			VBMSameOriginLimit: clampInt(
				raw.misc?.VBMSameOriginLimit,
				LMIN_VBM_SAME_ORIGIN_LIMIT,
				LMAX_VBM_SAME_ORIGIN_LIMIT,
				defaults.misc.VBMSameOriginLimit,
			),
		},
	};
};

export const getUserSettings = async (): Promise<LUserSettings> => {
	const { userSettings } = await getChromeStorageRecords({
		userSettings: LINITIAL_USER_SETTINGS.value,
	});
	const normalizedSettings = normalizeUserSettings(userSettings);
	if (JSON.stringify(userSettings) !== JSON.stringify(normalizedSettings)) {
		await setChromeStorageRecords({
			userSettings: normalizedSettings,
		});
	}
	return normalizedSettings;
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
	await setChromeStorageRecords({
		userSettings,
	});
};

export const getActiveUserId = async (): Promise<number | null> => {
	const { activeUserId } = await getChromeStorageRecords({
		activeUserId: null,
	});
	return typeof activeUserId === "number" && Number.isFinite(activeUserId)
		? activeUserId
		: null;
};

export const applyUnlockedSession = async (
	userId: number,
	settings: LUserSettings,
): Promise<void> => {
	await setChromeStorageRecords({
		userSettings: normalizeUserSettings(settings),
		activeUserId: userId,
	});
};

export const resetUserSettings = async (): Promise<void> => {
	await setChromeStorageRecords({
		userSettings: LINITIAL_USER_SETTINGS.value,
		activeUserId: null,
	});
};
