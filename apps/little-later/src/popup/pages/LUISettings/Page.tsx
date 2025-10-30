import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { motion, MotionProps } from "framer-motion";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import {
	CaretRightIcon,
	ExportIcon,
	RocketLaunchIcon,
	SignOutIcon,
	SparkleIcon,
	UserCircleIcon,
	WrenchIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { IconComponentType, LIconComponentType } from "../../../types";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";

function LUISettingsCell({
	name,
	icon,
	navigateTo,
	changeSettingsExitTransition,
	nextEntryTransition = entryTransitions.slideLeft,
}: {
	name: string;
	icon: IconComponentType | LIconComponentType;
	navigateTo: string;
	changeSettingsExitTransition: () => void;
	nextEntryTransition?: MotionProps;
}) {
	const { theme } = useTheme();
	const navigate = useNavigate();
	const handleOnClick = () => {
		changeSettingsExitTransition();
		navigate(navigateTo, {
			state: {
				entryTransition: nextEntryTransition,
				referrer: "/settings",
			},
		});
	};
	return (
		<div
			className={`flex h-10 w-full items-center justify-start gap-x-2 ${theme === LTHEME.DARK ? "hover:bg-neutral-900" : "hover:bg-neutral-100"} group cursor-pointer rounded-full p-1`}
			onClick={handleOnClick}
		>
			<div className="flex h-10 w-10 items-center justify-center">
				<LUIThemedIcon
					Icon={icon}
					weight="light"
					color={theme === LTHEME.DARK ? "white" : "black"}
					className="size-7"
				/>
			</div>
			<span
				className={`text-xl ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
			>
				{name}
			</span>
			<div className={`group flex flex-grow justify-end`}>
				<div
					className={`flex h-10 w-10 -translate-x-1 items-center justify-center opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100`}
				>
					<LUIThemedIcon
						Icon={CaretRightIcon}
						weight="light"
						color={theme === LTHEME.DARK ? "white" : "black"}
						className="size-5"
					/>
				</div>
			</div>
		</div>
	);
}

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit, setExit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});
	const onSettingClick = () => {
		setExit(exitTransitions.slideLeft);
	};
	return (
		<motion.div
			className={`flex h-full w-full flex-col select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} overflow-y-hidden`}
			{...entry}
			{...exit}
		>
			<LUIBasicNav navigateTo="/home" />
			<LUISettingsLayout pageName="Settings">
				<LUISettingsCell
					name="Getting Started"
					icon={RocketLaunchIcon}
					navigateTo="/getting-started"
					changeSettingsExitTransition={onSettingClick}
				/>
				<LUISettingsCell
					name="Profile"
					icon={UserCircleIcon}
					navigateTo="/profile"
					changeSettingsExitTransition={onSettingClick}
				/>
				<LUISettingsCell
					name="AI"
					icon={SparkleIcon}
					navigateTo="/settings/ai"
					changeSettingsExitTransition={onSettingClick}
				/>
				<LUISettingsCell
					name="Export"
					icon={ExportIcon}
					navigateTo="/export"
					changeSettingsExitTransition={onSettingClick}
				/>
				<LUISettingsCell
					name="Misc"
					icon={WrenchIcon}
					navigateTo="/settings/misc"
					changeSettingsExitTransition={onSettingClick}
				/>
				<LUISettingsCell
					name="Lock"
					icon={SignOutIcon}
					navigateTo="/lock"
					changeSettingsExitTransition={() =>
						setExit(exitTransitions.zoomOut)
					}
					nextEntryTransition={entryTransitions.zoomOut}
				/>
			</LUISettingsLayout>
		</motion.div>
	);
};

export { Page as LUISettings };
