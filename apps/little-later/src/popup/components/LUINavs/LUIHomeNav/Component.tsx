import { LTHEME, LLOWER_HOME_NAV_ROUTES } from "little-shared/enums";
import { LUIThemedIcon } from "../../LUIThemedIcon/Component";
import { useTheme } from "../../../hooks/useTheme";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import {
	entryTransitions,
	exitTransitions,
} from "../../../../route-transitions";
import { useContext } from "react";
import { HomeContext } from "../../../contexts/Home";
import { twMerge } from "tailwind-merge";
import { LTaskIcon, LReminderIcon } from "../../LUIIcons";

const Component = ({ className }: { className?: string }) => {
	const { theme } = useTheme();

	const {
		activeRoute,
		setActiveRoute,
		setHomeNavigation,
		setHomeSubNavigation,
		setShouldHomeSubNavigate,
	} = useContext(HomeContext);

	const handleRoute = (route: LLOWER_HOME_NAV_ROUTES) => {
		setHomeNavigation({
			exit: exitTransitions.none,
		});
		let newRoute = route;
		if (activeRoute === route) {
			newRoute = LLOWER_HOME_NAV_ROUTES.SELF;
		}
		setActiveRoute(newRoute);
		setHomeSubNavigation({
			exit: exitTransitions.slideDown,
			navigateTo: newRoute,
			navigateOptions: {
				state: { subEntryTransition: entryTransitions.slideUp },
			},
		});
		setShouldHomeSubNavigate(true);
	};

	return (
		<div
			className={twMerge(
				`z-10 grid h-16 w-full shrink-0 grid-cols-3 ${
					theme === LTHEME.DARK
						? "border-t border-neutral-800 bg-black"
						: "border-t border-neutral-200 bg-white"
				}`,
				className,
			)}
		>
			<div
				className={`group flex h-full w-full cursor-pointer flex-col items-center justify-center py-1 ${
					theme === LTHEME.DARK
						? activeRoute === LLOWER_HOME_NAV_ROUTES.HISTORY
							? "bg-white"
							: ""
						: activeRoute === LLOWER_HOME_NAV_ROUTES.HISTORY
							? "bg-black"
							: ""
				} `}
				onClick={() => handleRoute(LLOWER_HOME_NAV_ROUTES.HISTORY)}
			>
				<div
					className={`flex h-full w-4/5 items-center justify-center py-0.5 ${
						theme === LTHEME.DARK
							? activeRoute === LLOWER_HOME_NAV_ROUTES.HISTORY
								? "bg-neutral-100"
								: "group-hover:bg-neutral-800"
							: activeRoute === LLOWER_HOME_NAV_ROUTES.HISTORY
								? "bg-neutral-900"
								: "group-hover:bg-neutral-200"
					} rounded-full transition-all duration-300`}
				>
					<LUIThemedIcon
						Icon={ClockCounterClockwiseIcon}
						color={
							theme === LTHEME.DARK
								? activeRoute === LLOWER_HOME_NAV_ROUTES.HISTORY
									? "black"
									: "white"
								: activeRoute === LLOWER_HOME_NAV_ROUTES.HISTORY
									? "white"
									: "black"
						}
						weight={
							activeRoute === LLOWER_HOME_NAV_ROUTES.HISTORY
								? "duotone"
								: "bold"
						}
						className="h-full w-7"
					/>
				</div>
				<div
					className={`flex h-max w-full items-center justify-center text-sm font-medium ${
						theme === LTHEME.DARK
							? activeRoute === LLOWER_HOME_NAV_ROUTES.HISTORY
								? "text-black"
								: "text-white"
							: activeRoute === LLOWER_HOME_NAV_ROUTES.HISTORY
								? "text-white"
								: "text-black"
					} `}
				>
					History
				</div>
			</div>

			{/* New LTask Button */}
			<div
				className={`group flex h-full w-full cursor-pointer flex-col items-center justify-center py-1`}
				onClick={() => handleRoute(LLOWER_HOME_NAV_ROUTES.NEW_TASK)}
			>
				<div
					className={`flex h-full w-4/5 items-center justify-center py-0.5 ${
						theme === LTHEME.DARK
							? activeRoute === LLOWER_HOME_NAV_ROUTES.NEW_TASK
								? "bg-white"
								: "group-hover:bg-neutral-800"
							: activeRoute === LLOWER_HOME_NAV_ROUTES.NEW_TASK
								? "bg-black"
								: "group-hover:bg-neutral-200"
					} rounded-full transition-all duration-300`}
				>
					<LUIThemedIcon
						Icon={LTaskIcon}
						color={
							theme === LTHEME.DARK
								? activeRoute ===
									LLOWER_HOME_NAV_ROUTES.NEW_TASK
									? "black"
									: "white"
								: activeRoute ===
									  LLOWER_HOME_NAV_ROUTES.NEW_TASK
									? "white"
									: "black"
						}
						weight={
							activeRoute === LLOWER_HOME_NAV_ROUTES.NEW_TASK
								? "fill"
								: "bold"
						}
						className="h-full w-7"
					/>
				</div>
				<div
					className={`flex h-max w-full items-center justify-center text-sm font-medium ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
				>
					New Task
				</div>
			</div>

			{/* New LReminder Button */}
			<div
				className={`group flex h-full w-full cursor-pointer flex-col items-center justify-center py-1`}
				onClick={() => handleRoute(LLOWER_HOME_NAV_ROUTES.NEW_REMINDER)}
			>
				<div
					className={`flex h-full w-4/5 items-center justify-center py-0.5 ${
						theme === LTHEME.DARK
							? activeRoute ===
								LLOWER_HOME_NAV_ROUTES.NEW_REMINDER
								? "bg-white"
								: "group-hover:bg-neutral-800"
							: activeRoute ===
								  LLOWER_HOME_NAV_ROUTES.NEW_REMINDER
								? "bg-black"
								: "group-hover:bg-neutral-200"
					} rounded-full transition-all duration-300`}
				>
					<LUIThemedIcon
						Icon={LReminderIcon}
						color={
							theme === LTHEME.DARK
								? activeRoute ===
									LLOWER_HOME_NAV_ROUTES.NEW_REMINDER
									? "black"
									: "white"
								: activeRoute ===
									  LLOWER_HOME_NAV_ROUTES.NEW_REMINDER
									? "white"
									: "black"
						}
						weight={
							activeRoute === LLOWER_HOME_NAV_ROUTES.NEW_REMINDER
								? "fill"
								: "bold"
						}
						className="h-full w-7 transition-all"
					/>
				</div>
				<div
					className={`flex h-max w-full items-center justify-center text-sm font-medium ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
				>
					New Reminder
				</div>
			</div>
		</div>
	);
};

export { Component as LUIHomeNav };
