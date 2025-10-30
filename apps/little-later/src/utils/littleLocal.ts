import { LINITIAL_LL_CONFIG } from "little-shared/constants";
import { LittleLocalConfig } from "little-shared/types";
import { getChromeStorageRecords, setChromeStorageRecords } from "./chrome";

const updateLLConfig = async (
	changes: Partial<LittleLocalConfig>,
): Promise<void> => {
	const llConfig = await getLLConfig();
	await setChromeStorageRecords({
		littleLocalConfig: {
			...llConfig,
			...changes,
		},
	});
};

const getLLConfig = async (): Promise<LittleLocalConfig> => {
	const { littleLocalConfig } = await getChromeStorageRecords({
		littleLocalConfig: LINITIAL_LL_CONFIG.value,
	});
	return littleLocalConfig;
};

type LocalFetchResponse = {
	use: boolean;
	response?: Response;
};

const localFetch = async (
	path: string,
	init?: RequestInit,
): Promise<LocalFetchResponse> => {
	const llConfig = await getLLConfig();
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	if (llConfig.isEnabled) {
		const response = await fetch(
			`http://localhost:${llConfig.port}/api${normalizedPath}`,
			init,
		);
		if (response.status == 200) {
			return {
				use: true,
				response: response,
			};
		} else if (response.status >= 400) {
			console.error(
				`Error from local server (status ${response.status}):`,
				await response.text(),
			);
		} else if (response.status >= 300) {
			console.warn(
				`Unexpected status from local server (status ${response.status}):`,
				await response.text(),
			);
		} else if (response.status > 200) {
			console.log(
				`Non-200 status from local server (status ${response.status}):`,
				await response.text(),
			);
		} else {
			console.log(
				`Unknown status from local server (status ${response.status}):`,
				await response.text(),
			);
		}
		return {
			use: true,
		};
	}
	return {
		use: false,
	};
};

export { updateLLConfig, getLLConfig, localFetch };
