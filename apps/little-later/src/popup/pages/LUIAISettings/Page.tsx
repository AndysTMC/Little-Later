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

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});
	const userSettings = useCurrentUserSettings();
	const AIProviderList = Object.values(LAI_PROVIDERS);
	const [aiSettings, setAISettings] = useState<LAISettings | undefined>(
		userSettings?.ai,
	);
	const loading = useLoading([userSettings]);
	const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (userSettings == undefined || aiSettings === undefined) {
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
	}, [aiSettings, AIProviderList, userSettings]);

	useEffect(() => {
		if (
			aiSettings &&
			aiSettings.assist.apiKey === "" &&
			(aiSettings.generate.provider !== LAI_PROVIDERS.CHROME_AI ||
				aiSettings.rephrase.provider !== LAI_PROVIDERS.CHROME_AI ||
				aiSettings.summarize.provider !== LAI_PROVIDERS.CHROME_AI)
		) {
			setAISettings((prevSettings) => ({
				...prevSettings!,
				rephrase: {
					provider: LAI_PROVIDERS.CHROME_AI,
				},
				generate: {
					provider: LAI_PROVIDERS.CHROME_AI,
				},
				summarize: {
					provider: LAI_PROVIDERS.CHROME_AI,
				},
			}));
		}
	}, [aiSettings, setAISettings]);

	useEffect(() => {
		if (userSettings === undefined) {
			return;
		}
		setAISettings(userSettings.ai);
	}, [userSettings]);

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
									} `}
								>
									AI Assist
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
										} `}
									>
										API Provider
									</div>
									<LUISelectT2
										options={AIProviderList.filter(
											(option) =>
												option !==
												LAI_PROVIDERS.CHROME_AI,
										)}
										currentOption={
											aiSettings!.assist.provider
										}
										onOptionChange={(value) =>
											setAISettings({
												...aiSettings!,
												assist: {
													...aiSettings!.assist,
													provider: value,
												},
											})
										}
									/>
								</div>
								<LUITextInputT1
									name="API Key"
									passedValue={
										aiSettings!.assist.apiKey || ""
									}
									onChange={(value) => {
										setAISettings({
											...aiSettings!,
											assist: {
												...aiSettings!.assist,
												apiKey: value,
											},
										});
									}}
									validate={() => {
										return {
											success: true,
											error: "",
										};
									}}
									lengthLimit={100}
									disableLengthCounter
								/>
								<LUITextInputT1
									name="Model"
									passedValue={aiSettings!.assist.model || ""}
									onChange={(value) => {
										setAISettings({
											...aiSettings!,
											assist: {
												...aiSettings!.assist,
												model: value,
											},
										});
									}}
									validate={() => {
										return {
											success: true,
											error: "",
										};
									}}
									lengthLimit={100}
									disableLengthCounter
								/>
							</div>
						</div>
						<div className={`flex h-max w-full flex-col`}>
							<div
								className={`flex h-max w-full items-center justify-between py-1`}
							>
								<div
									className={`h-auto w-max text-2xl font-bold ${
										theme === LTHEME.DARK
											? "text-white"
											: "text-black"
									} `}
								>
									AI Rephrase
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
										} `}
									>
										API Provider
									</div>
									<LUISelectT2
										options={AIProviderList}
										currentOption={
											aiSettings!.rephrase.provider
										}
										onOptionChange={(value) =>
											setAISettings({
												...aiSettings!,
												rephrase: {
													...aiSettings!.rephrase,
													provider: value,
												},
											})
										}
									/>
								</div>
							</div>
						</div>
						<div className={`flex h-max w-full flex-col py-2`}>
							<div
								className={`flex h-max w-full items-center justify-between py-1`}
							>
								<div
									className={`h-auto w-max text-2xl font-bold ${
										theme === LTHEME.DARK
											? "text-white"
											: "text-black"
									} `}
								>
									AI Generate
								</div>
							</div>
							<div className={`relative h-max w-full`}>
								<div
									className={`relative z-10 flex h-max w-full items-center justify-between py-1`}
								>
									<div
										className={`h-auto w-max text-lg ${
											theme === LTHEME.DARK
												? "text-white"
												: "text-black"
										} `}
									>
										API Provider
									</div>
									<LUISelectT2
										options={AIProviderList}
										currentOption={
											aiSettings!.generate.provider
										}
										onOptionChange={(value) =>
											setAISettings({
												...aiSettings!,
												generate: {
													...aiSettings!.generate,
													provider: value,
												},
											})
										}
									/>
								</div>
							</div>
						</div>
						<div className={`flex h-max w-full flex-col py-2`}>
							<div
								className={`flex h-max w-full items-center justify-between py-1`}
							>
								<div
									className={`h-auto w-max text-2xl font-bold ${
										theme === LTHEME.DARK
											? "text-white"
											: "text-black"
									} `}
								>
									AI Summarize
								</div>
							</div>
							<div className={`relative h-max w-full`}>
								<div
									className={`relative z-10 flex h-max w-full items-center justify-between py-1`}
								>
									<div
										className={`h-auto w-max text-lg ${
											theme === LTHEME.DARK
												? "text-white"
												: "text-black"
										} `}
									>
										API Provider
									</div>
									<LUISelectT2
										options={AIProviderList}
										currentOption={
											aiSettings!.summarize.provider
										}
										onOptionChange={(value) =>
											setAISettings({
												...aiSettings!,
												summarize: {
													...aiSettings!.summarize,
													provider: value,
												},
											})
										}
									/>
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
