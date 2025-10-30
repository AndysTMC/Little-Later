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
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { useTheme } from "../../hooks/useTheme";
import { exitTransitions } from "../../../route-transitions";
import { updateUserSettings } from "../../../services/settings";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});
	const userSettings = useCurrentUserSettings();
	const [miscSettings, setMiscSettings] = useState(
		LINITIAL_MISC_SETTINGS.value,
	);

	useEffect(() => {
		if (userSettings === undefined) {
			return;
		}

		const handler = setTimeout(() => {
			updateUserSettings({
				...userSettings,
				misc: miscSettings,
			});
		}, 500);

		return () => {
			clearTimeout(handler);
		};
	}, [miscSettings, userSettings]);

	useEffect(() => {
		if (userSettings) {
			setMiscSettings(userSettings.misc);
		}
	}, [userSettings]);

	return (
		<motion.div
			className={`flex h-full w-full flex-col select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} overflow-y-hidden`}
			{...entry}
			{...exit}
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
								Maximum number of visual bookmarks (History)
							</span>
						</div>
						<LUINumInput
							passedValue={miscSettings.VBMLimit}
							onChange={(value) => {
								setMiscSettings((prev) => ({
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
									...prev,
									VBMSameOriginLimit: value,
								}));
							}}
							minValue={LMIN_VBM_SAME_ORIGIN_LIMIT}
							maxValue={LMAX_VBM_SAME_ORIGIN_LIMIT}
						/>
					</div>
				</div>
			</LUISettingsLayout>
		</motion.div>
	);
};

export { Page as LUIMiscSettings };
