import { LTHEME } from "little-shared/enums";
import {
	GearIcon,
	MoonIcon,
	NotebookIcon,
	SignOutIcon,
	SparkleIcon,
	SunDimIcon,
	UserCircleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LUIHMNavMenuOption } from "../../LUIHMNavMenuOption/Component";
import { LUIThemedIcon } from "../../LUIThemedIcon/Component";
import {
	entryTransitions,
	exitTransitions,
} from "../../../../route-transitions";
import { useContext } from "react";
import { HomeContext } from "../../../contexts/Home";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../../hooks/useTheme";
import { LAISettings, LUserProfile } from "little-shared/types";
import { useUserAvatar } from "../../../hooks/useUserAvatar";

const Component = ({
	className,
	currentUserProfile,
	aiSettings,
}: {
	className?: string;
	currentUserProfile: LUserProfile;
	aiSettings: LAISettings | null;
}) => {
	const { theme, toggleTheme } = useTheme();
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const toggleMenu = () => {
		setIsMenuOpen(!isMenuOpen);
	};

	const userAvatar = useUserAvatar(currentUserProfile.userId);

	const { setHomeNavigation, setHomeSubNavigation, setShouldHomeNavigate } =
		useContext(HomeContext);

	const handleSettings = () => {
		setHomeSubNavigation({
			exit: exitTransitions.none,
		});
		setHomeNavigation({
			exit: exitTransitions.slideLeft,
			navigateTo: "/settings",
			navigateOptions: {
				state: { entryTransition: entryTransitions.slideLeft },
			},
		});
		setShouldHomeNavigate(true);
	};

	const handleProfile = () => {
		setHomeSubNavigation({
			exit: exitTransitions.none,
		});
		setHomeNavigation({
			exit: exitTransitions.slideLeft,
			navigateTo: "/profile",
			navigateOptions: {
				state: { entryTransition: entryTransitions.slideLeft },
			},
		});
		setShouldHomeNavigate(true);
	};

	const handleLock = () => {
		setHomeSubNavigation({
			exit: exitTransitions.none,
		});
		setHomeNavigation({
			exit: exitTransitions.zoomOut,
			navigateTo: "/lock",
			navigateOptions: {
				state: { entryTransition: entryTransitions.zoomOut },
			},
		});
		setShouldHomeNavigate(true);
	};

	const handleAIClick = () => {
		setHomeSubNavigation({
			exit: exitTransitions.none,
		});
		setHomeNavigation({
			exit: exitTransitions.zoomIn,
			navigateTo: "/ai",
			navigateOptions: {
				state: { entryTransition: entryTransitions.zoomIn },
			},
		});
		setShouldHomeNavigate(true);
	};

	const handleNotebookClick = () => {
		setHomeSubNavigation({
			exit: exitTransitions.none,
		});
		setHomeNavigation({
			exit: exitTransitions.slideDown,
			navigateTo: "/notebook",
			navigateOptions: {
				state: { entryTransition: entryTransitions.slideDown },
			},
		});
		setShouldHomeNavigate(true);
	};

	return (
		<div
			className={twMerge(
				`${theme === LTHEME.DARK ? "bg-black" : "bg-white"} flex h-16 w-full items-center p-2`,
				className,
			)}
		>
			<div className={`h-full w-max`}>
				<img
					src={`/images/${theme}-icon.png`}
					alt="Little Later Logo"
					className={`h-12 w-12`}
					draggable="false"
				/>
			</div>
			<div
				className={`relative flex h-full grow items-center justify-end gap-x-2 pr-2`}
			>
				<div
					className={`h-max w-max cursor-pointer rounded-lg p-1 active:scale-90 hover:${theme === LTHEME.DARK ? "bg-neutral-800" : "bg-neutral-200"}`}
					onClick={handleNotebookClick}
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							handleAIClick();
						}
					}}
				>
					<LUIThemedIcon
						Icon={NotebookIcon}
						weight="regular"
						className="size-7"
					/>
				</div>
				{aiSettings && aiSettings.assist.apiKey !== "" ? (
					<div
						className={`h-max w-max cursor-pointer rounded-full p-1 active:scale-90 hover:${theme === LTHEME.DARK ? "bg-neutral-800" : "bg-neutral-200"}`}
						onClick={handleAIClick}
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleAIClick();
							}
						}}
					>
						<LUIThemedIcon
							Icon={SparkleIcon}
							weight="regular"
							className="size-7"
						/>
					</div>
				) : null}
				<div
					className={`h-max w-max ${
						theme === LTHEME.DARK
							? "hover:bg-neutral-800"
							: "hover:bg-neutral-200"
					} cursor-pointer rounded-full p-1`}
					onClick={toggleTheme}
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							toggleTheme();
						}
					}}
				>
					<LUIThemedIcon
						Icon={theme === LTHEME.DARK ? MoonIcon : SunDimIcon}
						weight="fill"
						className="size-7"
					/>
				</div>
				<div className="relative h-max w-max">
					<div
						className={`h-max w-max rounded-full border-4 ${
							isMenuOpen
								? theme === LTHEME.DARK
									? "border-neutral-700"
									: "border-neutral-300"
								: "border-transparent"
						} cursor-pointer`}
						onClick={toggleMenu}
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								setIsMenuOpen(false);
							}
							if (e.key === "Enter") {
								toggleMenu();
							}
						}}
					>
						{userAvatar?.blob ? (
							<img
								src={URL.createObjectURL(userAvatar.blob)}
								alt={currentUserProfile.name}
								className={`h-7 w-7 rounded-full object-cover`}
								draggable="false"
							/>
						) : (
							<LUIThemedIcon
								Icon={UserCircleIcon}
								weight="fill"
								className="size-7"
							/>
						)}
					</div>
				</div>
			</div>
			<div className={`absolute top-14 right-4 z-20 h-max w-36`}>
				<AnimatePresence>
					{isMenuOpen ? (
						<motion.div
							className={`h-max w-full ${
								theme === LTHEME.DARK
									? "border-neutral-700 bg-black"
									: "border-neutral-300 bg-white"
							} overflow-clip rounded-lg border border-solid border-neutral-300 shadow-lg`}
							initial={{ opacity: 0, y: -10 }}
							animate={{
								opacity: 1,
								y: 0,
							}}
							transition={{ duration: 0.3 }}
							exit={{
								opacity: 0,
								y: -10,
								transition: { duration: 0.3 },
							}}
						>
							<LUIHMNavMenuOption
								name="Profile"
								icon={
									<LUIThemedIcon
										Icon={UserCircleIcon}
										className="size-5"
									/>
								}
								animationDelay={0.1}
								onClick={handleProfile}
							/>
							<LUIHMNavMenuOption
								name="Settings"
								icon={
									<LUIThemedIcon
										Icon={GearIcon}
										className="size-5"
									/>
								}
								animationDelay={0.2}
								onClick={handleSettings}
							/>
							<LUIHMNavMenuOption
								name="Lock"
								icon={
									<LUIThemedIcon
										Icon={SignOutIcon}
										className="size-5"
									/>
								}
								isLast={true}
								animationDelay={0.3}
								onClick={handleLock}
							/>
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
		</div>
	);
};

export { Component as LUIHomeMainNav };
