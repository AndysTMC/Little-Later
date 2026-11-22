import { openLittleAI } from "../../../openLittleAI";
import { LUILogo } from "../../LUILogo/Component";
import { LTHEME } from "little-shared/enums";
import {
	GearIcon,
	MoonIcon,
	SignOutIcon,
	SparkleIcon,
	SunDimIcon,
	UserCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LUIHMNavMenuOption } from "../../LUIHMNavMenuOption/Component";
import { LUIThemedIcon } from "../../LUIThemedIcon/Component";
import { useMoveNavigate } from "../../../hooks/usePageMove";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../../hooks/useTheme";
import { LAISettings } from "little-shared/types";
import type { UserProfile } from "../../../hooks/useUserProfiles";
import { useUserAvatar } from "../../../hooks/useUserAvatar";
import { useObjectUrl } from "../../../hooks/useObjectUrl";
import { isAISettingsConfigured } from "../../../../services/ai/config";
import { useSidePanelMode } from "../../../hooks/useSidePanelMode";

const Component = ({
	className,
	currentUserProfile,
	aiSettings,
}: {
	className?: string;
	currentUserProfile: UserProfile;
	aiSettings: LAISettings | null;
}) => {
	const { theme, toggleTheme } = useTheme();
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const toggleRef = useRef<HTMLButtonElement>(null);
	const toggleMenu = () => {
		setIsMenuOpen((open) => !open);
	};

	useEffect(() => {
		if (!isMenuOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsMenuOpen(false);
				toggleRef.current?.focus();
			}
		};
		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (
				target &&
				!menuRef.current?.contains(target) &&
				!toggleRef.current?.contains(target)
			) {
				setIsMenuOpen(false);
			}
		};
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("mousedown", onPointerDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("mousedown", onPointerDown);
		};
	}, [isMenuOpen]);

	const userAvatar = useUserAvatar(currentUserProfile.id);
	const avatarUrl = useObjectUrl(userAvatar);

	const go = useMoveNavigate();
	const sidePanelMode = useSidePanelMode();

	const handleOpenAI = () => {
		if (
			sidePanelMode === "ai" &&
			document.documentElement.dataset.surface !== "panel"
		) {
			openLittleAI();
			return;
		}
		go("/ai", "forward");
	};

	const handleSettings = () => go("/settings", "forward");

	const handleProfile = () => go("/profile", "forward");

	// Locking steps out of the profile.
	const handleLock = () => go("/lock", "outOf");

	return (
		<div
			className={twMerge(
				`${theme === LTHEME.DARK ? "bg-black" : "bg-white"} flex h-16 w-full shrink-0 items-center p-2`,
				className,
			)}
		>
			<div className={`h-full w-max`}>
				<LUILogo className="h-12 w-12" />
			</div>
			<div
				className={`relative flex h-full grow items-center justify-end gap-x-2 pr-2`}
			>
				{isAISettingsConfigured(aiSettings) ? (
					<button
						type="button"
						aria-label="Open LittleAI"
						className={`h-max w-max cursor-pointer rounded-full p-1 active:scale-90 ${
							theme === LTHEME.DARK
								? "hover:bg-neutral-800"
								: "hover:bg-neutral-200"
						}`}
						onClick={handleOpenAI}
					>
						<LUIThemedIcon
							Icon={SparkleIcon}
							weight="regular"
							className="size-7"
						/>
					</button>
				) : null}
				<button
					type="button"
					aria-label={
						theme === LTHEME.DARK
							? "Switch to light theme"
							: "Switch to dark theme"
					}
					className={`h-max w-max ${
						theme === LTHEME.DARK
							? "hover:bg-neutral-800"
							: "hover:bg-neutral-200"
					} cursor-pointer rounded-full p-1`}
					onClick={toggleTheme}
				>
					<LUIThemedIcon
						Icon={theme === LTHEME.DARK ? MoonIcon : SunDimIcon}
						weight="fill"
						className="size-7"
					/>
				</button>
				<div className="relative h-max w-max">
					<button
						ref={toggleRef}
						type="button"
						aria-label="Open profile menu"
						aria-haspopup="menu"
						aria-expanded={isMenuOpen}
						className={`h-max w-max rounded-full border-4 bg-transparent ${
							isMenuOpen
								? theme === LTHEME.DARK
									? "border-neutral-700"
									: "border-neutral-300"
								: "border-transparent"
						} cursor-pointer`}
						onClick={toggleMenu}
					>
						{avatarUrl ? (
							<img
								src={avatarUrl}
								alt=""
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
					</button>
				</div>
			</div>
			<div
				ref={menuRef}
				className={`absolute top-14 right-4 z-20 h-max w-36`}
			>
				<AnimatePresence>
					{isMenuOpen ? (
						<motion.div
							role="menu"
							className={`flex h-max w-full flex-col gap-y-0.5 rounded-xl border p-1 shadow-lg ${
								theme === LTHEME.DARK
									? "border-neutral-800 bg-neutral-900"
									: "border-neutral-200 bg-white"
							}`}
							initial={{ opacity: 0, y: -6, scale: 0.98 }}
							animate={{
								opacity: 1,
								y: 0,
								scale: 1,
							}}
							transition={{ duration: 0.14 }}
							exit={{
								opacity: 0,
								y: -6,
								scale: 0.98,
								transition: { duration: 0.1 },
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
