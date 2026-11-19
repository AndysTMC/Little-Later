import {
	LINITIAL_MISC_SETTINGS,
	LMAX_VBM_LIMIT,
	LMAX_VBM_SAME_ORIGIN_LIMIT,
	LMIN_VBM_LIMIT,
	LMIN_VBM_SAME_ORIGIN_LIMIT,
} from "little-shared/constants";
import { LTHEME } from "little-shared/enums";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUINumInput } from "../../components/LUINumInput/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { send } from "../../../utils/send";
import { motion } from "framer-motion";

import { useDebouncedSave } from "../../hooks/useDebouncedSave";

import { useSettingDraft } from "../../hooks/useSettingDraft";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { LUISettingSelect } from "../../components/LUISettingRow/Component";
import { attempt } from "../../attempt";

// Auto-lock after this many idle minutes (0010, Locking), up to the four
// hours Chrome's idle detection allows.
const AUTO_LOCK_CHOICES = [5, 15, 30, 60, 240].map((minutes) => ({
	value: minutes,
	label:
		minutes < 60
			? `${minutes} minutes`
			: `${minutes / 60} hour${minutes === 60 ? "" : "s"}`,
}));

type Misc = { VBMLimit: number; VBMSameOriginLimit: number };
const sameMisc = (a: Misc, b: Misc) =>
	a.VBMLimit === b.VBMLimit && a.VBMSameOriginLimit === b.VBMSameOriginLimit;

const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const userSettings = useCurrentUserSettings();
	const profile = useCurrentUserProfile();
	const [miscDraft, setMiscSettings] = useSettingDraft(
		"settings.misc",
		userSettings?.misc,
		sameMisc,
	);
	const miscSettings = miscDraft ?? LINITIAL_MISC_SETTINGS.value;

	const inRange =
		miscSettings.VBMLimit >= LMIN_VBM_LIMIT &&
		miscSettings.VBMLimit <= LMAX_VBM_LIMIT &&
		miscSettings.VBMSameOriginLimit >= LMIN_VBM_SAME_ORIGIN_LIMIT &&
		miscSettings.VBMSameOriginLimit <= LMAX_VBM_SAME_ORIGIN_LIMIT;
	const changed =
		userSettings !== undefined &&
		(miscSettings.VBMLimit !== userSettings.misc.VBMLimit ||
			miscSettings.VBMSameOriginLimit !==
				userSettings.misc.VBMSameOriginLimit);
	useDebouncedSave(
		inRange && changed
			? () => send("settings.update", { misc: miscSettings })
			: null,
		500,
		miscSettings,
	);

	return (
		<motion.div
			className={`flex h-full w-full flex-col select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} overflow-y-hidden`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo="/settings" />
			<LUISettingsLayout pageName="Misc Settings">
				<div className={`relative h-max w-full`}>
					<div
						className={`relative flex h-max w-full items-center justify-between py-2`}
					>
						<div className={`h-max grow`}>
							<span
								className={`text-lg ${theme === LTHEME.DARK ? "text-white" : "text-black"}`}
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
					<div className={`flex h-max w-full items-center py-2`}>
						<div className={`h-max grow`}>
							<span
								className={`text-lg ${theme === LTHEME.DARK ? "text-white" : "text-black"}`}
							>
								Maximum number of visual bookmarks with same
								origin (History)
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
							options={AUTO_LOCK_CHOICES}
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
				</div>
			</LUISettingsLayout>
		</motion.div>
	);
};

export { Page as LUIMiscSettings };
