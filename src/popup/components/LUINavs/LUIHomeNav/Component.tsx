import { LTHEME, LLOWER_HOME_NAV_ROUTES } from "little-shared/enums";
import { LUIThemedIcon } from "../../LUIThemedIcon/Component";
import { useTheme } from "../../../hooks/useTheme";
import { ClockCounterClockwiseIcon, NotebookIcon } from "@phosphor-icons/react";
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
		name: "New task",
		Icon: LTaskIcon,
	},
	{
		route: LLOWER_HOME_NAV_ROUTES.NEW_REMINDER,
		label: "New reminder",
		name: "New reminder",
		Icon: LReminderIcon,
	},
	{
		route: LLOWER_HOME_NAV_ROUTES.NEW_NOTE,
		label: "New note",
		name: "New note",
		Icon: NotebookIcon,
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
				`z-10 h-16 w-full shrink-0 border-t px-2 py-1.5 ${
					isDark
						? "border-neutral-800 bg-black"
						: "border-neutral-200 bg-white"
				}`,
				className,
			)}
		>
			<div className="mx-auto grid h-full w-full max-w-3xl grid-cols-4">
				{TABS.map(({ route, label, name, Icon }) => {
					const isActive = activeRoute === route;
					return (
						<button
							key={route}
							type="button"
							aria-label={label}
							aria-pressed={isActive}
							className={`group flex h-full w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-y-0.5 rounded-xl px-0.5 transition-colors ${
								isActive
									? isDark
										? "text-white"
										: "text-black"
									: isDark
										? "text-neutral-400 hover:text-neutral-200"
										: "text-neutral-500 hover:text-neutral-900"
							}`}
							onClick={() => handleRoute(route)}
						>
							<div
								className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
									isActive
										? "ll-accent-fill"
										: isDark
											? "group-hover:bg-neutral-900"
											: "group-hover:bg-neutral-100"
								}`}
							>
								<LUIThemedIcon
									Icon={Icon}
									color="currentColor"
									weight={isActive ? "fill" : "regular"}
									className="size-5"
								/>
							</div>
							<span className="max-w-full truncate text-[11px] font-medium">
								{name}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
};

export { Component as LUIHomeNav };
