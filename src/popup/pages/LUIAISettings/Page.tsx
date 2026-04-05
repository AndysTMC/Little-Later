import { useLittleTransition } from "../../hooks/useLittleTransition";
import { exitTransitions } from "../../../route-transitions";
import { LAI_PROVIDERS, LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { updateAISettings } from "../../../services/settings";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISelectT2 } from "../../components/LUISelectT2/Component";
import { LUITextInputT1 } from "../../components/LUITextInput/Component";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { LAISettings } from "little-shared/types";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import {
	fetchProviderModels,
	getDefaultBaseUrl,
	getResolvedBaseUrl,
} from "../../../services/ai/config";
import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});
	const userSettings = useCurrentUserSettings();
	const AIProviderList = Object.values(LAI_PROVIDERS) as Array<LAI_PROVIDERS>;
	const [aiSettings, setAISettings] = useState<LAISettings | undefined>(
		userSettings?.ai,
	);
	const [models, setModels] = useState<Array<string>>([]);
	const [isFetchingModels, setIsFetchingModels] = useState(false);
	const loading = useLoading([userSettings]);
	const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const latestFetchIdRef = useRef(0);

	useEffect(() => {
		if (userSettings === undefined || aiSettings === undefined) {
			return;
		}
		if (updateTimeoutRef.current) {
			clearTimeout(updateTimeoutRef.current);
		}
		updateTimeoutRef.current = setTimeout(async () => {
			await updateAISettings(aiSettings);
		}, 500);
		return () => {
			if (updateTimeoutRef.current) {
				clearTimeout(updateTimeoutRef.current);
			}
		};
	}, [aiSettings, userSettings]);

	useEffect(() => {
		if (userSettings === undefined) {
			return;
		}
		setAISettings(userSettings.ai);
	}, [userSettings]);

	useEffect(() => {
		if (!aiSettings) {
			setModels([]);
			setIsFetchingModels(false);
			return;
		}

		if (fetchTimeoutRef.current) {
			clearTimeout(fetchTimeoutRef.current);
		}

		fetchTimeoutRef.current = setTimeout(async () => {
			const currentFetchId = latestFetchIdRef.current + 1;
			latestFetchIdRef.current = currentFetchId;

			const effectiveBaseUrl = getResolvedBaseUrl(aiSettings);
			if (effectiveBaseUrl === "") {
				setIsFetchingModels(false);
				setModels([]);
				return;
			}

			setIsFetchingModels(true);
			const fetchedModels = await fetchProviderModels(aiSettings);
			if (latestFetchIdRef.current !== currentFetchId) {
				return;
			}

			setModels(fetchedModels);
			setIsFetchingModels(false);

			if (
				fetchedModels.length > 0 &&
				!fetchedModels.includes(aiSettings.model)
			) {
				setAISettings((prevSettings) =>
					prevSettings
						? {
								...prevSettings,
								model: fetchedModels[0],
							}
						: prevSettings,
				);
			}
		}, 350);

		return () => {
			if (fetchTimeoutRef.current) {
				clearTimeout(fetchTimeoutRef.current);
			}
		};
	}, [aiSettings?.provider, aiSettings?.baseUrl, aiSettings?.apiKey]);

	const handleProviderChange = (provider: LAI_PROVIDERS) => {
		setAISettings((prevSettings) => {
			if (!prevSettings) {
				return prevSettings;
			}
			const nextBaseUrl =
				provider === LAI_PROVIDERS.CUSTOM
					? prevSettings.provider === LAI_PROVIDERS.CUSTOM
						? prevSettings.baseUrl
						: ""
					: getDefaultBaseUrl(provider);
			return {
				...prevSettings,
				provider,
				baseUrl: nextBaseUrl,
			};
		});
	};

	return (
		<motion.div
			className={`h-full w-full select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"}`}
			{...entry}
			{...exit}
		>
			{loading ? (
				<LUILoading />
			) : (
				<motion.div
					className={`flex h-full w-full flex-col overflow-y-hidden`}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
				>
					<LUIBasicNav navigateTo="/settings" />
					<LUISettingsLayout pageName="AI Settings">
						<div className={`flex h-max w-full flex-col gap-1`}>
							<div
								className={`flex h-max w-full items-center justify-between py-1`}
							>
								<div
									className={`h-auto w-max text-2xl font-bold ${
										theme === LTHEME.DARK
											? "text-white"
											: "text-black"
									}`}
								>
									AI Provider
								</div>
							</div>
							<div className={`relative h-max w-full`}>
								<div
									className={`relative z-40 flex h-max w-full items-center justify-between py-1`}
								>
									<div
										className={`h-auto w-max text-lg ${
											theme === LTHEME.DARK
												? "text-white"
												: "text-black"
										}`}
									>
										Provider
									</div>
									<LUISelectT2
										testId="ai-provider-select"
										options={AIProviderList}
										currentOption={
											aiSettings?.provider ?? LAI_PROVIDERS.OLLAMA
										}
										onOptionChange={handleProviderChange}
									/>
								</div>

								{aiSettings?.provider === LAI_PROVIDERS.CUSTOM ? (
									<LUITextInputT1
										name="Base URL"
										passedValue={aiSettings?.baseUrl ?? ""}
										onChange={(value) => {
											setAISettings((prevSettings) =>
												prevSettings
													? {
														...prevSettings,
														baseUrl: value,
													}
													: prevSettings,
											);
										}}
										validate={() => ({
											success: true,
											error: "",
										})}
										lengthLimit={256}
										disableLengthCounter
									/>
								) : (
									<div
										className={`mb-1 rounded-xl border px-4 py-2 text-sm ${
											theme === LTHEME.DARK
												? "border-neutral-700 text-neutral-300"
												: "border-neutral-300 text-neutral-700"
										}`}
									>
										Using built-in URL: {" "}
										{getDefaultBaseUrl(
											aiSettings?.provider ?? LAI_PROVIDERS.OLLAMA,
										)}
									</div>
								)}

								<LUITextInputT1
									name="API Key (Custom provider only)"
									passedValue={aiSettings?.apiKey ?? ""}
									onChange={(value) => {
										setAISettings((prevSettings) =>
											prevSettings
												? {
														...prevSettings,
														apiKey: value,
													}
												: prevSettings,
										);
									}}
									validate={() => ({
										success: true,
										error: "",
									})}
									disabled={aiSettings?.provider !== LAI_PROVIDERS.CUSTOM}
									lengthLimit={256}
									disableLengthCounter
								/>

								<div className="mt-1 flex h-max w-full flex-col gap-y-1">
									<div
										className={`px-1 text-lg ${
											theme === LTHEME.DARK
												? "text-white"
												: "text-black"
										}`}
									>
										Models
									</div>
									<div
										data-testid="ai-model-list"
										className={`h-max max-h-44 w-full overflow-y-auto rounded-xl border p-1 ${
											theme === LTHEME.DARK
												? "border-neutral-700 bg-black"
												: "border-neutral-300 bg-white"
										} ${theme}-scrollbar`}
									>
										{isFetchingModels ? (
											<div
												className={`px-3 py-2 text-sm ${
													theme === LTHEME.DARK
														? "text-neutral-300"
														: "text-neutral-700"
												}`}
											>
												Loading models...
											</div>
										) : models.length === 0 ? (
											<div
												className={`px-3 py-2 text-sm ${
													theme === LTHEME.DARK
														? "text-neutral-300"
														: "text-neutral-700"
												}`}
											>
												No models available...
											</div>
										) : (
											models.map((modelName) => {
												const isSelected =
													(aiSettings?.model ?? "") === modelName;
												return (
													<div
														key={modelName}
														data-testid="ai-model-option"
														data-model-name={modelName}
														className={`mb-1 flex h-9 w-full cursor-pointer items-center justify-between rounded-lg px-3 text-sm transition-colors last:mb-0 ${
															isSelected
																? theme === LTHEME.DARK
																	? "bg-neutral-800"
																	: "bg-neutral-200"
																: theme === LTHEME.DARK
																	? "hover:bg-neutral-900"
																	: "hover:bg-neutral-100"
														}`}
														onClick={() => {
															setAISettings((prevSettings) =>
																prevSettings
																	? {
																		...prevSettings,
																		model: modelName,
																	}
																	: prevSettings,
															);
														}}
													>
														<span
															className={`${
																theme === LTHEME.DARK
																	? "text-white"
																	: "text-black"
															} max-w-[85%] truncate`}
														>
															{modelName}
														</span>
														<LUIThemedIcon
															Icon={
																isSelected
																	? CheckCircleIcon
																	: CircleIcon
															}
															weight="fill"
															className="size-4"
														/>
													</div>
												);
											})
										)}
									</div>
								</div>
							</div>
						</div>
						<div className="h-20 w-full"></div>
					</LUISettingsLayout>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIAISettings };
