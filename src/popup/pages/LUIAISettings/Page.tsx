import { usePageMotion } from "../../hooks/usePageMove";
import { LAI_PROVIDERS, LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { send } from "../../../utils/send";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISelectT2 } from "../../components/LUISelectT2/Component";
import { LUINote } from "../../components/LUINote/Component";
import { LUITextInputT1 } from "../../components/LUITextInput/Component";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { LAISettings } from "little-shared/types";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import {
	describeProcessing,
	fetchProviderModels,
	getDefaultBaseUrl,
	isCloudModel,
	getBaseUrlProblem,
	getResolvedBaseUrl,
} from "../../../services/ai/config";
import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";

import { useDebouncedSave } from "../../hooks/useDebouncedSave";

import { useSettingDraft } from "../../hooks/useSettingDraft";

const sameAI = (a: LAISettings, b: LAISettings) =>
	JSON.stringify(a) === JSON.stringify(b);

const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const userSettings = useCurrentUserSettings();
	const AIProviderList = Object.values(LAI_PROVIDERS) as Array<LAI_PROVIDERS>;
	const [aiSettings, setAISettings] = useSettingDraft<LAISettings>(
		"settings.ai",
		userSettings?.ai,
		sameAI,
	);
	const [models, setModels] = useState<Array<string>>([]);
	const [isFetchingModels, setIsFetchingModels] = useState(false);
	const loading = useLoading([userSettings]);
	// A custom server is asked for its models only when the user says
	// so. Asking while the URL is being typed sent the API key to every
	// half-typed host.
	const [loadToken, setLoadToken] = useState(0);
	const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const latestFetchIdRef = useRef(0);

	useDebouncedSave(
		userSettings !== undefined &&
			aiSettings !== undefined &&
			JSON.stringify(aiSettings) !== JSON.stringify(userSettings.ai)
			? () => send("settings.update", { ai: aiSettings })
			: null,
		500,
		aiSettings,
	);

	useEffect(() => {
		if (
			!aiSettings ||
			(aiSettings.provider === LAI_PROVIDERS.CUSTOM && loadToken === 0)
		) {
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

			if (fetchedModels.length > 0 && aiSettings.model.trim() === "") {
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
		// The URL and key are read when the list is asked for, not
		// watched: see loadToken.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [aiSettings?.provider, loadToken]);

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
			{...pageMotion}
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
											aiSettings?.provider ??
											LAI_PROVIDERS.OLLAMA
										}
										onOptionChange={handleProviderChange}
									/>
								</div>

								{aiSettings?.provider ===
								LAI_PROVIDERS.CUSTOM ? (
									<LUITextInputT1
										name="Base URL"
										inputType="url"
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
										validate={(value) => {
											const problem =
												getBaseUrlProblem(value);
											return {
												success: problem === null,
												error: problem ?? "",
											};
										}}
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
										Using built-in URL:{" "}
										{getDefaultBaseUrl(
											aiSettings?.provider ??
												LAI_PROVIDERS.OLLAMA,
										)}
									</div>
								)}

								<LUITextInputT1
									name="API Key (Custom provider only)"
									inputType="password"
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
									disabled={
										aiSettings?.provider !==
										LAI_PROVIDERS.CUSTOM
									}
									lengthLimit={4096}
									disableLengthCounter
								/>

								{aiSettings?.provider ===
								LAI_PROVIDERS.CUSTOM ? (
									<>
										<LUITextInputT1
											name="Model"
											passedValue={aiSettings.model}
											onChange={(value) => {
												setAISettings((prevSettings) =>
													prevSettings
														? {
																...prevSettings,
																model: value,
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
										<div className="flex h-max w-full items-center gap-x-2">
											<button
												type="button"
												disabled={
													getResolvedBaseUrl(
														aiSettings,
													) === ""
												}
												className={`h-max w-max shrink-0 cursor-pointer rounded-full px-4 py-1 text-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
													theme === LTHEME.DARK
														? "bg-white text-black"
														: "bg-black text-white"
												}`}
												onClick={() =>
													setLoadToken(
														(token) => token + 1,
													)
												}
											>
												Load models
											</button>
											<span
												className={`text-xs ${
													theme === LTHEME.DARK
														? "text-neutral-300"
														: "text-neutral-600"
												}`}
											>
												Sends your API key to the server
												above. Or type the model's name.
											</span>
										</div>
									</>
								) : null}

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
													(aiSettings?.model ??
														"") === modelName;
												return (
													<button
														type="button"
														key={modelName}
														data-testid="ai-model-option"
														data-model-name={
															modelName
														}
														className={`mb-1 flex h-9 w-full cursor-pointer items-center justify-between rounded-lg px-3 text-sm transition-colors last:mb-0 ${
															isSelected
																? theme ===
																	LTHEME.DARK
																	? "bg-neutral-800"
																	: "bg-neutral-200"
																: theme ===
																	  LTHEME.DARK
																	? "hover:bg-neutral-900"
																	: "hover:bg-neutral-100"
														}`}
														onClick={() => {
															setAISettings(
																(
																	prevSettings,
																) =>
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
																theme ===
																LTHEME.DARK
																	? "text-white"
																	: "text-black"
															} max-w-[85%] truncate`}
														>
															{modelName}
														</span>
														{aiSettings &&
														isCloudModel(
															aiSettings.provider,
															modelName,
														) ? (
															<span
																className={`mr-2 ml-auto shrink-0 rounded-full border px-2 text-xs ${
																	theme ===
																	LTHEME.DARK
																		? "border-neutral-600 text-neutral-300"
																		: "border-neutral-400 text-neutral-600"
																}`}
															>
																Cloud
															</span>
														) : null}
														<LUIThemedIcon
															Icon={
																isSelected
																	? CheckCircleIcon
																	: CircleIcon
															}
															weight="fill"
															className="size-4"
														/>
													</button>
												);
											})
										)}
									</div>
								</div>
							</div>
						</div>
						{aiSettings ? (
							<LUINote className="w-full pt-3">
								{describeProcessing(aiSettings)} The right-click
								AI actions send only the text you selected.
							</LUINote>
						) : null}
						<div className="h-20 w-full"></div>
					</LUISettingsLayout>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIAISettings };
