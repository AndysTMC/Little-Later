import { motion } from "framer-motion";
import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import {
	DatabaseIcon,
	ExportIcon,
	PaletteIcon,
	RocketLaunchIcon,
	ShieldCheckIcon,
	SignOutIcon,
	SparkleIcon,
	UserCircleIcon,
	WrenchIcon,
} from "@phosphor-icons/react";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISettingLink } from "../../components/LUISettingRow/Component";

const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	return (
		<motion.div
			className={`flex h-full w-full flex-col select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} overflow-y-hidden`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo="/home" />
			<LUISettingsLayout pageName="Settings">
				<LUISettingLink
					label="Getting Started"
					icon={RocketLaunchIcon}
					to="/getting-started"
					referrer="/settings"
				/>
				<LUISettingLink
					label="Profile"
					icon={UserCircleIcon}
					to="/profile"
					referrer="/settings"
				/>
				<LUISettingLink
					label="Appearance"
					icon={PaletteIcon}
					to="/settings/appearance"
					referrer="/settings"
				/>
				<LUISettingLink
					label="Security"
					icon={ShieldCheckIcon}
					to="/settings/security"
					referrer="/settings"
				/>
				<LUISettingLink
					label="Data & Privacy"
					icon={DatabaseIcon}
					to="/settings/privacy"
					referrer="/settings"
				/>
				<LUISettingLink
					label="AI"
					icon={SparkleIcon}
					to="/settings/ai"
					referrer="/settings"
				/>
				<LUISettingLink
					label="Export"
					icon={ExportIcon}
					to="/export"
					referrer="/settings"
				/>
				<LUISettingLink
					label="Misc"
					icon={WrenchIcon}
					to="/settings/misc"
					referrer="/settings"
				/>
				<LUISettingLink
					label="Lock"
					icon={SignOutIcon}
					to="/lock"
					referrer="/settings"
					move="outOf"
				/>
			</LUISettingsLayout>
		</motion.div>
	);
};

export { Page as LUISettings };
