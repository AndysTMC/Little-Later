import { LTHEME, LLOWER_HOME_NAV_ROUTES } from "little-shared/enums";
import { LUIThemedIcon } from "../../LUIThemedIcon/Component";
import { useTheme } from "../../../hooks/useTheme";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { useLocation } from "react-router";
import { useMoveNavigate } from "../../../hooks/usePageMove";
import { twMerge } from "tailwind-merge";
import { LTaskIcon, LReminderIcon } from "../../LUIIcons";
import type { IconComponentType, LIconComponentType } from "../../../../types";

// Left to right, as they appear in the tab bar.
const TABS: ReadonlyArray<{
	route: LLOWER_HOME_NAV_ROUTES;
	label: string;
	name: string;
	Icon: IconComponentType | LIconComponentType;
}> = [
	{
		route: LLOWER_HOME_NAV_ROUTES.HISTORY,
		label: "History",
		name: "History",
		Icon: ClockCounterClockwiseIcon,
	},
	{
		route: LLOWER_HOME_NAV_ROUTES.NEW_TASK,
		label: "New task",
		name: "New Task",
		Icon: LTaskIcon,
	},
	{
		route: LLOWER_HOME_NAV_ROUTES.NEW_REMINDER,
		label: "New reminder",
		name: "New Reminder",
		Icon: LReminderIcon,
	},
];

const Component = ({ className }: { className?: string }) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;

	const location = useLocation();
	const go = useMoveNavigate();
	const tabs = TABS.map((tab) => tab.route as string);
	const activeRoute = tabs.includes(location.pathname)
		? location.pathname
		: LLOWER_HOME_NAV_ROUTES.SELF;

	// A tab opens its panel over the list; pressing it again closes it.
	// Between panels, the next one slides in from its side of the tab bar.
	const handleRoute = (route: LLOWER_HOME_NAV_ROUTES) => {
		if (activeRoute === route) {
			go(LLOWER_HOME_NAV_ROUTES.SELF, "sink");
		} else if (activeRoute === LLOWER_HOME_NAV_ROUTES.SELF) {
			go(route, "rise");
		} else {
			go(
				route,
				tabs.indexOf(route) > tabs.indexOf(activeRoute)
					? "forward"
					: "back",
			);
		}
	};

	return (
		<div
			className={twMerge(
				`z-10 grid h-16 w-full shrink-0 grid-cols-3 ${
					isDark
						? "border-t border-neutral-800 bg-black"
						: "border-t border-neutral-200 bg-white"
				}`,
				className,
			)}
		>
			{TABS.map(({ route, label, name, Icon }) => {
				const isActive = activeRoute === route;
				return (
					<button
						key={route}
						type="button"
						aria-label={label}
						aria-pressed={isActive}
						// The open panel's tab is drawn in the profile's accent.
						className={`group flex h-full w-full cursor-pointer flex-col items-center justify-center py-1 ${
							isActive
								? "ll-accent-fill"
								: isDark
									? "text-white"
									: "text-black"
						}`}
						onClick={() => handleRoute(route)}
					>
						<div
							className={`flex h-full w-4/5 items-center justify-center rounded-full py-0.5 transition-all duration-300 ${
								isActive
									? "bg-[color-mix(in_srgb,var(--ll-accent-ink)_12%,transparent)]"
									: isDark
										? "group-hover:bg-neutral-800"
										: "group-hover:bg-neutral-200"
							}`}
						>
							<LUIThemedIcon
								Icon={Icon}
								color="currentColor"
								weight={isActive ? "duotone" : "bold"}
								className="h-full w-7"
							/>
						</div>
						<div className="flex h-max w-full items-center justify-center text-sm font-medium">
							{name}
						</div>
					</button>
				);
			})}
		</div>
	);
};

export { Component as LUIHomeNav };
