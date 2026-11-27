import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MOTION } from "../../../route-transitions";
import { CheckCircleIcon, CircleIcon, XIcon } from "@phosphor-icons/react";
import { LAI_PROVIDERS, LTHEME } from "little-shared/enums";
import type { LAIPreset, LAISettings } from "little-shared/types";
import { send } from "../../../utils/send";
import { useTheme } from "../../hooks/useTheme";
import { usePageMotion } from "../../hooks/usePageMove";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { useLoading } from "../../hooks/useLoading";
import { useDebouncedSave } from "../../hooks/useDebouncedSave";
import { useSettingDraft } from "../../hooks/useSettingDraft";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUINote } from "../../components/LUINote/Component";
import { LUITextInputT1 } from "../../components/LUITextInput/Component";
import { LUIPillButton } from "../../components/LUIPillButton/Component";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import {
	CLOUD_PROVIDER_PRESETS,
	LOCAL_PROVIDER_PRESETS,
	describeProcessing,
	fetchProviderModels,
	getBaseUrlProblem,
	getDefaultBaseUrl,
	getProviderDisplayName,
	getResolvedBaseUrl,
	isCloudModel,
	testAIConnection,
	type AIConnectionTestResult,
} from "../../../services/ai/config";

type ProviderCategory = "local" | "cloud" | "custom";

type ProviderDraft = Pick<
	LAISettings,
	"provider" | "baseUrl" | "apiKey" | "model" | "presets"
>;

const sameProviderDraft = (a: ProviderDraft, b: ProviderDraft) =>
	JSON.stringify(a) === JSON.stringify(b);

const urlOrigin = (value: string): string | null => {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	try {
		return new URL(trimmed).origin;
	} catch {
		return null;
	}
};

const CATEGORY_OPTIONS: ReadonlyArray<{
	value: ProviderCategory;
	label: string;
}> = [
	{ value: "local", label: "Local" },
	{ value: "cloud", label: "Cloud" },
	{ value: "custom", label: "Custom" },
];

const inferCategory = (
	ai?: Pick<LAISettings, "provider" | "baseUrl">,
): ProviderCategory => {
	if (!ai) return "local";
	if (
		ai.provider === LAI_PROVIDERS.OLLAMA ||
		ai.provider === LAI_PROVIDERS.LM_STUDIO
	) {
		return "local";
	}
	const trimmed = ai.baseUrl.trim();
	if (
		LOCAL_PROVIDER_PRESETS.some(
			(preset) =>
				preset.provider === LAI_PROVIDERS.CUSTOM &&
				preset.baseUrl === trimmed,
		)
	) {
		return "local";
	}
	if (CLOUD_PROVIDER_PRESETS.some((preset) => preset.baseUrl === trimmed)) {
		return "cloud";
	}
	return "custom";
};

/**
 * Provider & Model configuration sub-page (`/settings/ai/provider`).
 *
 * Fixed presets (Local & Cloud) hide immutable endpoint URLs to keep the
 * interface clean; only Custom asks for a Base URL. API keys are bound to
 * their origin and automatically cleared whenever switching providers or
 * editing a Custom URL to a different host.
 */
const Page = () => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const pageMotion = usePageMotion();
	const userSettings = useCurrentUserSettings();
	const storedProviderDraft: ProviderDraft | undefined = userSettings
		? {
				provider: userSettings.ai.provider,
				baseUrl: userSettings.ai.baseUrl,
				apiKey: userSettings.ai.apiKey,
				model: userSettings.ai.model,
				...(userSettings.ai.presets
					? { presets: userSettings.ai.presets }
					: {}),
			}
		: undefined;
	const [aiSettings, setAISettings] = useSettingDraft<ProviderDraft>(
		"settings.ai.provider",
		storedProviderDraft,
		sameProviderDraft,
	);
	const loading = useLoading([userSettings]);
	const [selectedCategory, setSelectedCategory] =
		useState<ProviderCategory | null>(null);
	const category = selectedCategory ?? inferCategory(aiSettings);

	// Scope model discovery and connection-test results to the active endpoint
	// so switching presets or custom URLs immediately clears stale models.
	const endpointKey = aiSettings
		? `${aiSettings.provider}:${getResolvedBaseUrl(aiSettings)}`
		: "";
	const [loadRequest, setLoadRequest] = useState<{
		endpointKey: string;
		token: number;
	}>({ endpointKey: "", token: 0 });
	const activeLoadToken =
		loadRequest.endpointKey === endpointKey ? loadRequest.token : 0;
	const fetchScope =
		aiSettings &&
		!(aiSettings.provider === LAI_PROVIDERS.CUSTOM && activeLoadToken === 0)
			? `${endpointKey}:${activeLoadToken}`
			: null;
	const [modelState, setModelState] = useState<{
		scope: string;
		models: Array<string>;
		fetching: boolean;
	} | null>(null);
	const models =
		fetchScope !== null && modelState?.scope === fetchScope
			? modelState.models
			: [];
	const isFetchingModels =
		fetchScope !== null &&
		modelState?.scope === fetchScope &&
		modelState.fetching;
	const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const latestFetchIdRef = useRef(0);
	const [testing, setTesting] = useState(false);
	const [testState, setTestState] = useState<{
		endpointKey: string;
		result: AIConnectionTestResult;
	} | null>(null);
	const testResult =
		testState && testState.endpointKey === endpointKey
			? testState.result
			: null;
	const [presetName, setPresetName] = useState("");

	const withEndpoint = (
		prev: ProviderDraft,
		provider: LAI_PROVIDERS,
		baseUrl: string,
	): ProviderDraft => {
		const nextOrigin =
			provider === LAI_PROVIDERS.CUSTOM ? urlOrigin(baseUrl) : null;
		// Read the origin from the same draft as the key, even after a preset changes elsewhere.
		const boundOrigin =
			prev.provider === LAI_PROVIDERS.CUSTOM
				? urlOrigin(prev.baseUrl)
				: null;
		const originChanged =
			prev.apiKey !== "" &&
			(provider !== LAI_PROVIDERS.CUSTOM ||
				boundOrigin === null ||
				nextOrigin !== boundOrigin);
		return {
			...prev,
			provider,
			baseUrl,
			...(originChanged ? { apiKey: "" } : {}),
		};
	};

	useDebouncedSave(
		storedProviderDraft !== undefined &&
			aiSettings !== undefined &&
			!sameProviderDraft(aiSettings, storedProviderDraft)
			? () =>
					send("settings.update", {
						ai: {
							provider: aiSettings.provider,
							baseUrl: aiSettings.baseUrl,
							apiKey: aiSettings.apiKey,
							model: aiSettings.model,
							presets: aiSettings.presets ?? [],
						},
					})
			: null,
		500,
		aiSettings,
	);

	useEffect(() => {
		if (!aiSettings || fetchScope === null) {
			latestFetchIdRef.current += 1;
			return;
		}

		if (fetchTimeoutRef.current) {
			clearTimeout(fetchTimeoutRef.current);
		}

		const scope = fetchScope;
		fetchTimeoutRef.current = setTimeout(async () => {
			const currentFetchId = latestFetchIdRef.current + 1;
			latestFetchIdRef.current = currentFetchId;

			const effectiveBaseUrl = getResolvedBaseUrl(aiSettings);
			if (effectiveBaseUrl === "") {
				setModelState({ scope, models: [], fetching: false });
				return;
			}

			setModelState({ scope, models: [], fetching: true });
			const fetchedModels = await fetchProviderModels(aiSettings);
			if (latestFetchIdRef.current !== currentFetchId) {
				return;
			}

			setModelState({ scope, models: fetchedModels, fetching: false });

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
			latestFetchIdRef.current += 1;
			if (fetchTimeoutRef.current) {
				clearTimeout(fetchTimeoutRef.current);
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [fetchScope]);

	const handleCategoryChange = (nextCategory: ProviderCategory) => {
		setSelectedCategory(nextCategory);
		setTestState(null);
		if (nextCategory === "local") {
			if (
				aiSettings &&
				aiSettings.provider === LAI_PROVIDERS.CUSTOM &&
				!LOCAL_PROVIDER_PRESETS.some(
					(preset) => preset.baseUrl === aiSettings.baseUrl.trim(),
				)
			) {
				setAISettings((prev) =>
					prev
						? withEndpoint(
								prev,
								LAI_PROVIDERS.OLLAMA,
								getDefaultBaseUrl(LAI_PROVIDERS.OLLAMA),
							)
						: prev,
				);
			}
			return;
		}
		if (nextCategory === "cloud") {
			setAISettings((prev) => {
				if (!prev) return prev;
				const alreadyCloud = CLOUD_PROVIDER_PRESETS.some(
					(preset) => preset.baseUrl === prev.baseUrl.trim(),
				);
				return withEndpoint(
					prev,
					LAI_PROVIDERS.CUSTOM,
					alreadyCloud
						? prev.baseUrl
						: CLOUD_PROVIDER_PRESETS[0].baseUrl,
				);
			});
			return;
		}
		setAISettings((prev) => {
			if (!prev) return prev;
			const isKnownPreset =
				prev.provider !== LAI_PROVIDERS.CUSTOM ||
				CLOUD_PROVIDER_PRESETS.some(
					(preset) => preset.baseUrl === prev.baseUrl.trim(),
				) ||
				LOCAL_PROVIDER_PRESETS.some(
					(preset) => preset.baseUrl === prev.baseUrl.trim(),
				);
			return withEndpoint(
				prev,
				LAI_PROVIDERS.CUSTOM,
				isKnownPreset ? "" : prev.baseUrl,
			);
		});
	};

	const handleTestConnection = async () => {
		if (!aiSettings || testing) return;
		const testedEndpoint = endpointKey;
		const testedScope = fetchScope;
		setTesting(true);
		setTestState(null);
		try {
			const result = await testAIConnection(aiSettings);
			setTestState({ endpointKey: testedEndpoint, result });
			if (result.models.length > 0 && testedScope !== null) {
				setModelState({
					scope: testedScope,
					models: result.models,
					fetching: false,
				});
			}
		} finally {
			setTesting(false);
		}
	};

	const handleSavePreset = () => {
		if (!aiSettings) return;
		const model = aiSettings.model.trim();
		if (model === "") return;
		const providerLabel = getProviderDisplayName(aiSettings);
		const name =
			presetName.trim() || `${providerLabel} · ${model}`.slice(0, 60);
		const entry: LAIPreset = {
			id: crypto.randomUUID(),
			name,
			provider: aiSettings.provider,
			baseUrl: aiSettings.baseUrl,
			apiKey: aiSettings.apiKey,
			model,
		};
		setAISettings((prev) =>
			prev
				? {
						...prev,
						presets: [...(prev.presets ?? []), entry],
					}
				: prev,
		);
		setPresetName("");
	};

	const handleApplyPreset = (preset: LAIPreset) => {
		setTestState(null);
		setSelectedCategory(null);
		setAISettings((prev) =>
			prev
				? {
						...prev,
						provider: preset.provider,
						baseUrl: preset.baseUrl,
						apiKey: preset.apiKey,
						model: preset.model,
					}
				: prev,
		);
	};

	const handleDeletePreset = (id: string) => {
		setAISettings((prev) =>
			prev
				? {
						...prev,
						presets: (prev.presets ?? []).filter(
							(preset) => preset.id !== id,
						),
					}
				: prev,
		);
	};

	const isBuiltInLocal =
		aiSettings?.provider === LAI_PROVIDERS.OLLAMA ||
		aiSettings?.provider === LAI_PROVIDERS.LM_STUDIO;
	const showBaseUrlInput = category === "custom";
	const showApiKeyInput = category === "cloud" || category === "custom";
	const showManualModelInput = !isBuiltInLocal;
	const apiKeyFieldLabel =
		category === "cloud" ? "API Key" : "API Key (optional)";

	return (
		<motion.div
			className={`h-full w-full select-none ${isDark ? "bg-black" : "bg-white"}`}
			{...pageMotion}
		>
			{loading ? (
				<LUILoading />
			) : (
				<motion.div
					className="flex h-full w-full flex-col overflow-y-hidden"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={MOTION.reveal}
				>
					<LUIBasicNav navigateTo="/settings/ai" />
					<LUISettingsLayout pageName="Provider & Model">
						<div className="flex h-max w-full flex-col gap-y-4 pb-4">
							<div className="flex h-max w-full flex-col gap-y-2.5">
								{/* Local | Cloud | Custom segmented control */}
								<div
									role="tablist"
									aria-label="Provider category"
									className={`grid w-full grid-cols-3 gap-1 rounded-xl border p-1 ${
										isDark
											? "border-neutral-800 bg-neutral-900"
											: "border-neutral-200 bg-neutral-100"
									}`}
								>
									{CATEGORY_OPTIONS.map((option) => {
										const active =
											category === option.value;
										return (
											<button
												key={option.value}
												type="button"
												role="tab"
												aria-selected={active}
												onClick={() =>
													handleCategoryChange(
														option.value,
													)
												}
												className={`cursor-pointer rounded-lg py-1.5 text-xs font-medium transition-colors ${
													active
														? "ll-accent-fill"
														: isDark
															? "text-neutral-400 hover:text-white"
															: "text-neutral-600 hover:text-black"
												}`}
											>
												{option.label}
											</button>
										);
									})}
								</div>

								{category === "local" ? (
									<div className="flex flex-wrap gap-1.5">
										{LOCAL_PROVIDER_PRESETS.map(
											(preset) => {
												const active =
													aiSettings?.provider ===
														preset.provider &&
													(preset.provider !==
														LAI_PROVIDERS.CUSTOM ||
														aiSettings.baseUrl.trim() ===
															preset.baseUrl);
												return (
													<button
														key={preset.name}
														type="button"
														aria-pressed={active}
														onClick={() => {
															setTestState(null);
															setAISettings(
																(prev) =>
																	prev
																		? withEndpoint(
																				prev,
																				preset.provider,
																				preset.baseUrl,
																			)
																		: prev,
															);
														}}
														className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
															active
																? "ll-accent-fill border-transparent"
																: isDark
																	? "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700 hover:text-white"
																	: "border-neutral-200 bg-neutral-100 text-neutral-700 hover:border-neutral-300 hover:text-black"
														}`}
													>
														{preset.name}
													</button>
												);
											},
										)}
									</div>
								) : null}

								{category === "cloud" ? (
									<div className="flex flex-wrap gap-1.5">
										{CLOUD_PROVIDER_PRESETS.map(
											(preset) => {
												const active =
													aiSettings?.provider ===
														LAI_PROVIDERS.CUSTOM &&
													aiSettings.baseUrl.trim() ===
														preset.baseUrl;
												return (
													<button
														key={preset.name}
														type="button"
														aria-pressed={active}
														onClick={() => {
															setTestState(null);
															setAISettings(
																(prev) =>
																	prev
																		? withEndpoint(
																				prev,
																				LAI_PROVIDERS.CUSTOM,
																				preset.baseUrl,
																			)
																		: prev,
															);
														}}
														className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
															active
																? "ll-accent-fill border-transparent"
																: isDark
																	? "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700 hover:text-white"
																	: "border-neutral-200 bg-neutral-100 text-neutral-700 hover:border-neutral-300 hover:text-black"
														}`}
													>
														{preset.name}
													</button>
												);
											},
										)}
									</div>
								) : null}

								{showBaseUrlInput ? (
									<LUITextInputT1
										name="Base URL"
										inputType="url"
										passedValue={aiSettings?.baseUrl ?? ""}
										onChange={(value) => {
											setTestState(null);
											setAISettings((prevSettings) =>
												prevSettings
													? withEndpoint(
															prevSettings,
															LAI_PROVIDERS.CUSTOM,
															value,
														)
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
								) : null}

								{showApiKeyInput ? (
									<LUITextInputT1
										name={apiKeyFieldLabel}
										inputType="password"
										passedValue={aiSettings?.apiKey ?? ""}
										onChange={(value) => {
											setTestState(null);
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
										lengthLimit={4096}
										disableLengthCounter
									/>
								) : null}

								{showManualModelInput ? (
									<LUITextInputT1
										name="Model"
										passedValue={aiSettings?.model ?? ""}
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
								) : null}

								<div className="flex flex-wrap items-center gap-2 pt-0.5">
									<LUIPillButton
										label={
											testing
												? "Testing…"
												: "Test connection"
										}
										disabled={
											testing ||
											!aiSettings ||
											getResolvedBaseUrl(aiSettings) ===
												""
										}
										onClick={() =>
											void handleTestConnection()
										}
									/>
									{!isBuiltInLocal && aiSettings ? (
										<LUIPillButton
											label="Load models"
											disabled={
												getResolvedBaseUrl(
													aiSettings,
												) === ""
											}
											onClick={() =>
												setLoadRequest((prev) => ({
													endpointKey,
													token:
														prev.endpointKey ===
														endpointKey
															? prev.token + 1
															: 1,
												}))
											}
										/>
									) : null}
								</div>

								{showApiKeyInput ? (
									<div
										className={`text-xs ${
											isDark
												? "text-neutral-400"
												: "text-neutral-600"
										}`}
									>
										Testing or loading models sends your API
										key to the selected provider. You can
										also type a model name directly.
									</div>
								) : null}

								{testResult ? (
									<LUINote
										warning={!testResult.ok}
										className="w-full"
									>
										{testResult.message}
									</LUINote>
								) : null}

								<div className="mt-1 flex h-max w-full flex-col gap-y-1.5">
									<div
										className={`text-sm font-semibold ${
											isDark ? "text-white" : "text-black"
										}`}
									>
										Models
									</div>
									<div
										data-testid="ai-model-list"
										className={`h-max max-h-44 w-full overflow-y-auto rounded-xl border p-1 ${
											isDark
												? "border-neutral-800 bg-neutral-900"
												: "border-neutral-200 bg-neutral-100"
										} ${theme}-scrollbar`}
									>
										{isFetchingModels ? (
											<div
												className={`px-3 py-2 text-sm ${
													isDark
														? "text-neutral-400"
														: "text-neutral-600"
												}`}
											>
												Loading models…
											</div>
										) : models.length === 0 ? (
											<div
												className={`px-3 py-2 text-sm ${
													isDark
														? "text-neutral-400"
														: "text-neutral-600"
												}`}
											>
												{isBuiltInLocal
													? "No models found. Make sure your local server is running."
													: "Press Load models above, or type a model name."}
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
														aria-pressed={
															isSelected
														}
														data-testid="ai-model-option"
														data-model-name={
															modelName
														}
														className={`mb-1 flex h-9 w-full cursor-pointer items-center justify-between rounded-lg px-3 text-sm transition-colors last:mb-0 ${
															isSelected
																? isDark
																	? "bg-neutral-800"
																	: "bg-neutral-200"
																: isDark
																	? "hover:bg-neutral-800/60"
																	: "hover:bg-neutral-200/60"
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
																isDark
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
																	isDark
																		? "border-neutral-600 text-neutral-300"
																		: "border-neutral-400 text-neutral-600"
																}`}
															>
																Cloud
															</span>
														) : null}
														{isSelected ? (
															<LUIThemedIcon
																Icon={
																	CheckCircleIcon
																}
																color="currentColor"
																weight="fill"
																className="size-4 shrink-0 text-[var(--ll-accent)]"
															/>
														) : (
															<LUIThemedIcon
																Icon={
																	CircleIcon
																}
																color="currentColor"
																weight="regular"
																className={`size-4 shrink-0 ${
																	isDark
																		? "text-neutral-600"
																		: "text-neutral-400"
																}`}
															/>
														)}
													</button>
												);
											})
										)}
									</div>
								</div>
							</div>

							<div
								className={`flex flex-col gap-y-2 border-t pt-3 ${
									isDark
										? "border-neutral-800"
										: "border-neutral-200"
								}`}
							>
								<div
									className={`text-sm font-semibold ${
										isDark ? "text-white" : "text-black"
									}`}
								>
									Saved connections
								</div>
								<div
									className={`text-xs ${
										isDark
											? "text-neutral-400"
											: "text-neutral-600"
									}`}
								>
									Save provider and model combinations to
									switch quickly from Little AI chat.
								</div>
								<div className="flex items-center gap-2">
									<input
										type="text"
										value={presetName}
										maxLength={60}
										aria-label="Preset label (optional)"
										placeholder="Label (optional)"
										onChange={(event) =>
											setPresetName(event.target.value)
										}
										className={`ll-field h-9 min-w-0 grow rounded-xl border px-3 text-xs ${
											isDark
												? "border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500"
												: "border-neutral-300 bg-neutral-100 text-black placeholder:text-neutral-500"
										}`}
									/>
									<LUIPillButton
										label="Save current"
										disabled={
											!aiSettings ||
											aiSettings.model.trim() === ""
										}
										onClick={handleSavePreset}
									/>
								</div>
								{(aiSettings?.presets ?? []).length > 0 ? (
									<div className="flex flex-col gap-1.5">
										{(aiSettings?.presets ?? []).map(
											(preset) => {
												const active =
													aiSettings?.provider ===
														preset.provider &&
													aiSettings?.baseUrl ===
														preset.baseUrl &&
													aiSettings?.model ===
														preset.model;
												return (
													<div
														key={preset.id}
														className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
															active
																? isDark
																	? "border-neutral-600 bg-neutral-800/80"
																	: "border-neutral-400 bg-neutral-200/70"
																: isDark
																	? "border-neutral-800 bg-neutral-900"
																	: "border-neutral-200 bg-neutral-100"
														}`}
													>
														<div className="min-w-0">
															<div
																className={`truncate text-xs font-medium ${
																	isDark
																		? "text-white"
																		: "text-black"
																}`}
															>
																{preset.name}
															</div>
															<div
																className={`truncate text-[11px] ${
																	isDark
																		? "text-neutral-400"
																		: "text-neutral-600"
																}`}
															>
																{getProviderDisplayName(
																	preset,
																)}{" "}
																· {preset.model}
															</div>
														</div>
														<div className="flex shrink-0 items-center gap-1.5">
															{active ? (
																<span
																	className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
																		isDark
																			? "bg-neutral-700 text-neutral-200"
																			: "bg-neutral-300 text-neutral-800"
																	}`}
																>
																	Active
																</span>
															) : (
																<LUIPillButton
																	label="Use"
																	onClick={() =>
																		handleApplyPreset(
																			preset,
																		)
																	}
																/>
															)}
															<button
																type="button"
																aria-label={`Remove ${preset.name}`}
																onClick={() =>
																	handleDeletePreset(
																		preset.id,
																	)
																}
																className={`flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors ${
																	isDark
																		? "text-neutral-400 hover:bg-neutral-800 hover:text-white"
																		: "text-neutral-500 hover:bg-neutral-200 hover:text-black"
																}`}
															>
																<LUIThemedIcon
																	Icon={XIcon}
																	color="currentColor"
																	weight="regular"
																	className="size-3.5"
																/>
															</button>
														</div>
													</div>
												);
											},
										)}
									</div>
								) : null}
							</div>

							{aiSettings ? (
								<LUINote className="w-full">
									{describeProcessing(aiSettings)}
								</LUINote>
							) : null}
						</div>
					</LUISettingsLayout>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIAIProviderSettings };
