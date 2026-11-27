import { usePageMotion } from "../../hooks/usePageMove";
import { LAI_PROVIDERS, LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { send } from "../../../utils/send";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISettingSelect } from "../../components/LUISettingRow/Component";
import { LUINote } from "../../components/LUINote/Component";
import { LUITextInputT1 } from "../../components/LUITextInput/Component";
import { LUIPillButton } from "../../components/LUIPillButton/Component";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { LAIPreset, LAISettings, LAIVerbosity } from "little-shared/types";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import {
	CLOUD_PROVIDER_PRESETS,
	LOCAL_PROVIDER_PRESETS,
	describeProcessing,
	fetchProviderModels,
	getDefaultBaseUrl,
	isCloudModel,
	isLoopbackUrl,
	getBaseUrlProblem,
	getResolvedBaseUrl,
	testAIConnection,
	type AIConnectionTestResult,
} from "../../../services/ai/config";
import { CheckCircleIcon, CircleIcon, XIcon } from "@phosphor-icons/react";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { useDebouncedSave } from "../../hooks/useDebouncedSave";
import { useSettingDraft } from "../../hooks/useSettingDraft";

type ProviderCategory = "local" | "cloud" | "custom";

const sameAI = (a: LAISettings, b: LAISettings) =>
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

const VERBOSITY_OPTIONS: Array<{ value: LAIVerbosity; label: string }> = [
	{ value: "concise", label: "Concise" },
	{ value: "balanced", label: "Balanced" },
	{ value: "detailed", label: "Detailed" },
];

const CATEGORY_OPTIONS: ReadonlyArray<{
	value: ProviderCategory;
	label: string;
}> = [
	{ value: "local", label: "Local" },
	{ value: "cloud", label: "Cloud" },
	{ value: "custom", label: "Custom" },
];

const inferCategory = (ai?: LAISettings): ProviderCategory => {
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

const getLoopbackUrlProblem = (value: string): string | null => {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return "Enter a local URL, like http://127.0.0.1:3001/mcp";
	}
	if (
		(parsed.protocol === "http:" || parsed.protocol === "https:") &&
		isLoopbackUrl(parsed)
	) {
		return null;
	}
	return "Local MCP servers must use localhost or 127.0.0.1";
};

const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const userSettings = useCurrentUserSettings();
	const [aiSettings, setAISettings] = useSettingDraft<LAISettings>(
		"settings.ai",
		userSettings?.ai,
		sameAI,
	);
	const loading = useLoading([userSettings]);
	const [selectedCategory, setSelectedCategory] =
		useState<ProviderCategory | null>(null);
	const category = selectedCategory ?? inferCategory(aiSettings);

	// A custom server is asked for its models only when the user says
	// so. Asking while the URL is being typed sent the API key to every
	// half-typed host.
	const [loadToken, setLoadToken] = useState(0);
	const fetchScope =
		aiSettings &&
		!(aiSettings.provider === LAI_PROVIDERS.CUSTOM && loadToken === 0)
			? `${aiSettings.provider}:${loadToken}`
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
	// Tracks the origin that the current API key belongs to so switching
	// providers or editing the Base URL to another host never leaks a key.
	const keyOriginRef = useRef<string | null>(null);
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<AIConnectionTestResult | null>(
		null,
	);
	const [presetName, setPresetName] = useState("");
	const isDark = theme === LTHEME.DARK;

	const savedProvider = userSettings?.ai.provider;
	const savedBaseUrl = userSettings?.ai.baseUrl;
	const savedApiKey = userSettings?.ai.apiKey;
	useEffect(() => {
		if (savedProvider === undefined || savedApiKey === undefined) return;
		if (
			savedProvider === LAI_PROVIDERS.CUSTOM &&
			savedApiKey.trim() !== ""
		) {
			keyOriginRef.current = urlOrigin(savedBaseUrl ?? "");
		} else if (savedApiKey.trim() === "") {
			keyOriginRef.current = null;
		}
	}, [savedProvider, savedBaseUrl, savedApiKey]);

	const withEndpoint = (
		prev: LAISettings,
		provider: LAI_PROVIDERS,
		baseUrl: string,
	): LAISettings => {
		const nextOrigin =
			provider === LAI_PROVIDERS.CUSTOM ? urlOrigin(baseUrl) : null;
		const boundOrigin = keyOriginRef.current;
		const originChanged =
			prev.apiKey !== "" &&
			(provider !== LAI_PROVIDERS.CUSTOM ||
				(boundOrigin !== null && nextOrigin !== boundOrigin));
		if (originChanged) {
			keyOriginRef.current = null;
		}
		return {
			...prev,
			provider,
			baseUrl,
			...(originChanged ? { apiKey: "" } : {}),
		};
	};

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
		// The URL and key are read when the list is asked for, not
		// watched: see loadToken.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [fetchScope]);

	const handleCategoryChange = (nextCategory: ProviderCategory) => {
		setSelectedCategory(nextCategory);
		setTestResult(null);
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
		setTesting(true);
		setTestResult(null);
		try {
			const result = await testAIConnection(aiSettings);
			setTestResult(result);
			if (result.models.length > 0 && fetchScope !== null) {
				setModelState({
					scope: fetchScope,
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
		const cloudMatch = CLOUD_PROVIDER_PRESETS.find(
			(preset) => preset.baseUrl === aiSettings.baseUrl.trim(),
		);
		const localMatch = LOCAL_PROVIDER_PRESETS.find(
			(preset) =>
				preset.provider === aiSettings.provider &&
				(preset.provider !== LAI_PROVIDERS.CUSTOM ||
					preset.baseUrl === aiSettings.baseUrl.trim()),
		);
		const providerLabel =
			cloudMatch?.name ?? localMatch?.name ?? aiSettings.provider;
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
		setTestResult(null);
		setSelectedCategory(null);
		keyOriginRef.current =
			preset.provider === LAI_PROVIDERS.CUSTOM &&
			preset.apiKey.trim() !== ""
				? urlOrigin(preset.baseUrl)
				: null;
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

	const handleDeleteMemory = (id: string) => {
		setAISettings((prev) =>
			prev
				? {
						...prev,
						memories: (prev.memories ?? []).filter(
							(memory) => memory.id !== id,
						),
					}
				: prev,
		);
	};

	const isBuiltInLocal =
		aiSettings?.provider === LAI_PROVIDERS.OLLAMA ||
		aiSettings?.provider === LAI_PROVIDERS.LM_STUDIO;

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
				>
					<LUIBasicNav navigateTo="/settings" />
					<LUISettingsLayout pageName="AI Settings">
						<div className="flex h-max w-full flex-col gap-y-4">
							<div className="flex h-max w-full flex-col gap-y-2.5">
								<div
									className={`text-sm font-semibold ${
										isDark ? "text-white" : "text-black"
									}`}
								>
									Provider & connection
								</div>

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
														onClick={() => {
															setTestResult(null);
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
														onClick={() => {
															setTestResult(null);
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

								{isBuiltInLocal ? (
									<div
										className={`rounded-xl border px-3.5 py-2 text-xs ${
											isDark
												? "border-neutral-800 bg-neutral-900 text-neutral-300"
												: "border-neutral-200 bg-neutral-100 text-neutral-700"
										}`}
									>
										Built-in URL:{" "}
										{getDefaultBaseUrl(
											aiSettings?.provider ??
												LAI_PROVIDERS.OLLAMA,
										)}
									</div>
								) : (
									<>
										<LUITextInputT1
											name="Base URL"
											inputType="url"
											passedValue={
												aiSettings?.baseUrl ?? ""
											}
											onChange={(value) => {
												setTestResult(null);
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

										<LUITextInputT1
											name="API Key (Custom provider only)"
											inputType="password"
											passedValue={
												aiSettings?.apiKey ?? ""
											}
											onChange={(value) => {
												setTestResult(null);
												keyOriginRef.current =
													value.trim() === ""
														? null
														: (keyOriginRef.current ??
															urlOrigin(
																aiSettings?.baseUrl ??
																	"",
															));
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

										<LUITextInputT1
											name="Model"
											passedValue={
												aiSettings?.model ?? ""
											}
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
									</>
								)}

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
												setLoadToken(
													(token) => token + 1,
												)
											}
										/>
									) : null}
								</div>

								{!isBuiltInLocal ? (
									<div
										className={`text-xs ${
											isDark
												? "text-neutral-400"
												: "text-neutral-600"
										}`}
									>
										Testing or loading models sends your API
										key to the server above. You can also
										type a model name directly.
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

							<div className="relative z-30 flex flex-col gap-y-2">
								<div
									className={`text-sm font-semibold ${
										isDark ? "text-white" : "text-black"
									}`}
								>
									Response style
								</div>
								<LUISettingSelect<LAIVerbosity>
									label="Detail level"
									testId="ai-verbosity-select"
									value={aiSettings?.verbosity ?? "balanced"}
									options={VERBOSITY_OPTIONS}
									onChange={(verbosity) => {
										setAISettings((prev) =>
											prev
												? { ...prev, verbosity }
												: prev,
										);
									}}
								/>
							</div>

							<div className="flex flex-col gap-y-2">
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
																{
																	preset.provider
																}{" "}
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

							<div className="flex flex-col gap-y-2">
								<div
									className={`text-sm font-semibold ${
										isDark ? "text-white" : "text-black"
									}`}
								>
									Little AI memories
								</div>
								{(aiSettings?.memories ?? []).length === 0 ? (
									<div
										className={`rounded-xl border px-3.5 py-2.5 text-xs ${
											isDark
												? "border-neutral-800 bg-neutral-900 text-neutral-400"
												: "border-neutral-200 bg-neutral-100 text-neutral-600"
										}`}
									>
										No saved memories yet. Ask Little AI to
										remember a preference or project fact
										and confirm to save it here.
									</div>
								) : (
									<div className="flex flex-col gap-1.5">
										{(aiSettings?.memories ?? []).map(
											(memory) => (
												<div
													key={memory.id}
													className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2 ${
														isDark
															? "border-neutral-800 bg-neutral-900"
															: "border-neutral-200 bg-neutral-100"
													}`}
												>
													<span
														className={`text-xs leading-relaxed ${
															isDark
																? "text-neutral-200"
																: "text-neutral-800"
														}`}
													>
														{memory.text}
													</span>
													<button
														type="button"
														aria-label={`Forget memory: ${memory.text}`}
														onClick={() =>
															handleDeleteMemory(
																memory.id,
															)
														}
														className={`flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
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
											),
										)}
									</div>
								)}
							</div>

							<div className="flex flex-col gap-y-1">
								<div
									className={`text-sm font-semibold ${
										isDark ? "text-white" : "text-black"
									}`}
								>
									Local MCP tools (optional)
								</div>
								<LUITextInputT1
									name="Local MCP URL (127.0.0.1 / localhost)"
									inputType="url"
									passedValue={aiSettings?.mcpServerUrl ?? ""}
									onChange={(value) => {
										setAISettings((prev) =>
											prev
												? {
														...prev,
														mcpServerUrl: value,
													}
												: prev,
										);
									}}
									validate={(value) => {
										const problem =
											getLoopbackUrlProblem(value);
										return {
											success: problem === null,
											error: problem ?? "",
										};
									}}
									lengthLimit={256}
									disableLengthCounter
								/>
								<div
									className={`text-xs ${
										isDark
											? "text-neutral-400"
											: "text-neutral-600"
									}`}
								>
									Connect a local Streamable HTTP MCP server
									for extra tools in Little AI. Every external
									tool call asks for your approval first.
								</div>
							</div>

							{aiSettings ? (
								<LUINote className="w-full">
									{describeProcessing(aiSettings)} The
									right-click AI actions send only the text
									you selected.
								</LUINote>
							) : null}
						</div>
						<div className="h-20 w-full"></div>
					</LUISettingsLayout>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIAISettings };
