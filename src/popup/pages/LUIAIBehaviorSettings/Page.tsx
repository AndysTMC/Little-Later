import { motion } from "framer-motion";
import { LTHEME } from "little-shared/enums";
import type { LAISettings, LAIVerbosity } from "little-shared/types";
import { send } from "../../../utils/send";
import { useTheme } from "../../hooks/useTheme";
import { usePageMotion } from "../../hooks/usePageMove";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { useLoading } from "../../hooks/useLoading";
import { useDebouncedSave } from "../../hooks/useDebouncedSave";
import { useSettingDraft } from "../../hooks/useSettingDraft";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISettingSelect } from "../../components/LUISettingRow/Component";
import { LUINote } from "../../components/LUINote/Component";
import { LUILoading } from "../../components/LUILoading/Component";

const sameAI = (a: LAISettings, b: LAISettings) =>
	JSON.stringify(a) === JSON.stringify(b);

const VERBOSITY_OPTIONS: Array<{ value: LAIVerbosity; label: string }> = [
	{ value: "concise", label: "Concise" },
	{ value: "balanced", label: "Balanced" },
	{ value: "detailed", label: "Detailed" },
];

const MAX_INSTRUCTIONS = 1_000;

/**
 * Behavior & Instructions sub-page (`/settings/ai/behavior`).
 */
const Page = () => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const pageMotion = usePageMotion();
	const userSettings = useCurrentUserSettings();
	const [aiSettings, setAISettings] = useSettingDraft<LAISettings>(
		"settings.ai",
		userSettings?.ai,
		sameAI,
	);
	const loading = useLoading([userSettings]);

	useDebouncedSave(
		userSettings !== undefined &&
			aiSettings !== undefined &&
			JSON.stringify(aiSettings) !== JSON.stringify(userSettings.ai)
			? () => send("settings.update", { ai: aiSettings })
			: null,
		500,
		aiSettings,
	);

	const instructions = aiSettings?.instructions ?? "";

	return (
		<motion.div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${isDark ? "bg-black" : "bg-white"}`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo="/settings/ai" />
			{loading || !aiSettings ? (
				<LUILoading />
			) : (
				<LUISettingsLayout pageName="Behavior & Instructions">
					<div className="flex w-full flex-col gap-y-4 pt-1 pb-4">
						<div className="relative z-30 flex flex-col gap-y-1.5">
							<div
								className={`text-sm font-semibold ${isDark ? "text-white" : "text-black"}`}
							>
								Response style
							</div>
							<LUISettingSelect<LAIVerbosity>
								label="Detail level"
								testId="ai-verbosity-select"
								value={aiSettings.verbosity ?? "balanced"}
								options={VERBOSITY_OPTIONS}
								onChange={(verbosity) =>
									setAISettings((prev) =>
										prev ? { ...prev, verbosity } : prev,
									)
								}
							/>
						</div>

						<div
							className={`flex flex-col gap-y-2 border-t pt-3 ${
								isDark
									? "border-neutral-800"
									: "border-neutral-200"
							}`}
						>
							<div className="flex items-center justify-between gap-2">
								<label
									htmlFor="ai-custom-instructions"
									className={`text-sm font-semibold ${isDark ? "text-white" : "text-black"}`}
								>
									Custom instructions
								</label>
								<span
									className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
								>
									{instructions.length}/{MAX_INSTRUCTIONS}
								</span>
							</div>
							<textarea
								id="ai-custom-instructions"
								value={instructions}
								maxLength={MAX_INSTRUCTIONS}
								rows={5}
								placeholder='e.g. "Prefer short bullet points. Use ISO dates (YYYY-MM-DD)."'
								onChange={(event) => {
									const nextValue = event.target.value;
									setAISettings((prev) =>
										prev
											? {
													...prev,
													instructions: nextValue,
												}
											: prev,
									);
								}}
								className={`ll-field w-full resize-none rounded-xl border px-3 py-2 text-sm leading-relaxed select-text ${
									isDark
										? "border-neutral-700 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500"
										: "border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-500"
								}`}
							/>
							<LUINote className="w-full">
								Applied to every Little AI reply for this
								profile. Custom instructions never override
								confirmation or privacy safeguards.
							</LUINote>
						</div>
					</div>
				</LUISettingsLayout>
			)}
		</motion.div>
	);
};

export { Page as LUIAIBehaviorSettings };
