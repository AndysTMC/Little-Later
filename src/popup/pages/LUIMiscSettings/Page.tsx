import {
	LINITIAL_MISC_SETTINGS,
	LMAX_VBM_LIMIT,
	LMAX_VBM_SAME_ORIGIN_LIMIT,
	LMIN_VBM_LIMIT,
	LMIN_VBM_SAME_ORIGIN_LIMIT,
} from "little-shared/constants";
import { LHOME_MAIN_CONTENT, LTHEME } from "little-shared/enums";
import type { LUserSettings } from "little-shared/types";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUINumInput } from "../../components/LUINumInput/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUIPillButton } from "../../components/LUIPillButton/Component";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { send } from "../../../utils/send";
import { motion } from "framer-motion";
import { useDebouncedSave } from "../../hooks/useDebouncedSave";
import { useSettingDraft } from "../../hooks/useSettingDraft";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUISettingSelect } from "../../components/LUISettingRow/Component";
import { attempt } from "../../attempt";
import {
	setSidePanelMode,
	type SidePanelMode,
} from "../../../services/sidePanel";
import { useSidePanelMode } from "../../hooks/useSidePanelMode";

const SIDE_PANEL_OPTIONS: ReadonlyArray<{
	value: SidePanelMode;
	label: string;
}> = [
	{ value: "everything", label: "Everything" },
	{ value: "ai", label: "AI only" },
	{ value: "none", label: "None" },
];

const DEFAULT_HOME_TAB_OPTIONS: ReadonlyArray<{
	value: LHOME_MAIN_CONTENT;
	label: string;
}> = [
	{ value: LHOME_MAIN_CONTENT.SAVES, label: "Saves" },
	{ value: LHOME_MAIN_CONTENT.TASKS, label: "Tasks" },
	{ value: LHOME_MAIN_CONTENT.REMINDERS, label: "Reminders" },
	{ value: LHOME_MAIN_CONTENT.NOTES, label: "Notes" },
	{ value: LHOME_MAIN_CONTENT.IMAGES, label: "Images" },
];

// Auto-lock after this many idle minutes (0010, Locking), up to the four
// hours Chrome's idle detection allows.
const AUTO_LOCK_MINUTES = [1, 2, 5, 10, 15, 30, 45, 60, 120, 180, 240];
const lockLabel = (minutes: number) =>
	minutes < 60 || minutes % 60 !== 0
		? `${minutes} minute${minutes === 1 ? "" : "s"}`
		: `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
// The standard choices, and the profile's own if it is another (an older
// setting, or one from a backup), so the dropdown always shows it.
const autoLockChoices = (current: number) =>
	[...new Set([...AUTO_LOCK_MINUTES, current])]
		.sort((a, b) => a - b)
		.map((minutes) => ({ value: minutes, label: lockLabel(minutes) }));

type Misc = LUserSettings["misc"];
const sameMisc = (a: Misc, b: Misc) => JSON.stringify(a) === JSON.stringify(b);

const Page = () => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const pageMotion = usePageMotion();
	const userSettings = useCurrentUserSettings();
	const profile = useCurrentUserProfile();
	const sidePanelMode = useSidePanelMode();
	const loading = useLoading([userSettings, profile]);
	const [miscDraft, setMiscSettings] = useSettingDraft<Misc>(
		"settings.misc",
		userSettings?.misc,
		sameMisc,
	);
	const miscSettings: Misc = miscDraft ?? LINITIAL_MISC_SETTINGS.value;

	const inRange =
		miscSettings.VBMLimit >= LMIN_VBM_LIMIT &&
		miscSettings.VBMLimit <= LMAX_VBM_LIMIT &&
		miscSettings.VBMSameOriginLimit >= LMIN_VBM_SAME_ORIGIN_LIMIT &&
		miscSettings.VBMSameOriginLimit <= LMAX_VBM_SAME_ORIGIN_LIMIT;
	const changed =
		userSettings !== undefined &&
		!sameMisc(miscSettings, userSettings.misc);
	useDebouncedSave(
		inRange && changed
			? () => send("settings.update", { misc: miscSettings })
			: null,
		500,
		miscSettings,
	);

	const openChromeShortcuts = () => {
		if (typeof chrome !== "undefined" && chrome.tabs?.create) {
			void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
		}
	};

	return (
		<motion.div
			className={`flex h-full w-full flex-col select-none ${isDark ? "bg-black" : "bg-white"} overflow-y-hidden`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo="/settings" />
			{loading ? (
				<LUILoading />
			) : (
				<LUISettingsLayout pageName="Misc Settings">
					<div className="relative flex h-max w-full flex-col gap-y-1 pb-4">
						<div className="relative flex h-max w-full items-center justify-between gap-x-3 py-2">
							<div className="h-max grow">
								<span
									className={`text-sm font-medium ${isDark ? "text-neutral-100" : "text-neutral-900"}`}
								>
									Pages kept in history
								</span>
							</div>
							<LUINumInput
								passedValue={miscSettings.VBMLimit}
								onChange={(value) => {
									setMiscSettings((prev) => ({
										...LINITIAL_MISC_SETTINGS.value,
										...prev,
										VBMLimit: value,
									}));
								}}
								minValue={LMIN_VBM_LIMIT}
								maxValue={LMAX_VBM_LIMIT}
							/>
						</div>
						<div className="flex h-max w-full items-center justify-between gap-x-3 py-2">
							<div className="h-max grow">
								<span
									className={`text-sm font-medium ${isDark ? "text-neutral-100" : "text-neutral-900"}`}
								>
									History limit per site
								</span>
							</div>
							<LUINumInput
								passedValue={miscSettings.VBMSameOriginLimit}
								onChange={(value) => {
									setMiscSettings((prev) => ({
										...LINITIAL_MISC_SETTINGS.value,
										...prev,
										VBMSameOriginLimit: value,
									}));
								}}
								minValue={LMIN_VBM_SAME_ORIGIN_LIMIT}
								maxValue={LMAX_VBM_SAME_ORIGIN_LIMIT}
							/>
						</div>
						{profile ? (
							<LUISettingSelect
								label="Lock after idle"
								value={profile.autoLockMinutes}
								options={autoLockChoices(
									profile.autoLockMinutes,
								)}
								onChange={(minutes) => {
									void attempt(
										() =>
											send("profile.update", {
												autoLockMinutes: minutes,
											}),
										"Couldn't change when the profile locks.",
									);
								}}
							/>
						) : null}
						<LUISettingSelect
							label="Side panel"
							value={sidePanelMode}
							options={SIDE_PANEL_OPTIONS}
							onChange={(mode) => {
								void attempt(
									() => setSidePanelMode(mode),
									"Couldn't update the side panel setting.",
								);
							}}
						/>
						<LUISettingSelect
							label="Default Home tab"
							value={
								miscSettings.defaultHomeTab ??
								LHOME_MAIN_CONTENT.SAVES
							}
							options={DEFAULT_HOME_TAB_OPTIONS}
							onChange={(tab) => {
								setMiscSettings((prev) => ({
									...LINITIAL_MISC_SETTINGS.value,
									...prev,
									defaultHomeTab: tab,
								}));
							}}
						/>
						<div className="flex items-center justify-between gap-x-3 py-2">
							<span
								className={`text-sm font-medium ${isDark ? "text-neutral-100" : "text-neutral-900"}`}
							>
								Keyboard shortcuts
							</span>
							<LUIPillButton
								label="Configure"
								onClick={openChromeShortcuts}
							/>
						</div>
					</div>
				</LUISettingsLayout>
			)}
		</motion.div>
	);
};

export { Page as LUIMiscSettings };
