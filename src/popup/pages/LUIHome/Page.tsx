import { useLittleTransition } from "../../hooks/useLittleTransition";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME, LLOWER_HOME_NAV_ROUTES } from "little-shared/enums";
import { motion } from "framer-motion";
import { LUIHomeNav } from "../../components/LUINavs/LUIHomeNav/Component";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useEffect, useContext, useRef } from "react";
import { HomeContext } from "../../contexts/Home";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { useLinks } from "../../hooks/useLinks";
import { useNotes } from "../../hooks/useNotes";
import { useTasks } from "../../hooks/useTasks";
import { useVisualBMs } from "../../hooks/useVisualBMs";
import { useReminders } from "../../hooks/useReminders";
import { LUILoading } from "../../components/LUILoading/Component";

const Page = () => {
	const { theme } = useTheme();
	const navigate = useNavigate();
	const location = useLocation();
	const { entry } = useLittleTransition({});

	const currentUserProfile = useCurrentUserProfile();
	const userSettings = useCurrentUserSettings();
	const links = useLinks();
	const notes = useNotes();
	const reminders = useReminders();
	const tasks = useTasks();
	const visualBMs = useVisualBMs();
	const hasLoadedOnce = useRef(false);
	if (
		!hasLoadedOnce.current &&
		currentUserProfile &&
		userSettings &&
		links &&
		notes &&
		reminders &&
		tasks &&
		visualBMs
	) {
		hasLoadedOnce.current = true;
	}
	const {
		setActiveRoute,
		homeNavigation,
		homeSubNavigation,
		setShouldHomeNavigate,
		setShouldHomeSubNavigate,
		shouldHomeNavigate,
		shouldHomeSubNavigate,
		setHomeNavigation,
		setHomeSubNavigation,
	} = useContext(HomeContext);

	useEffect(() => {
		if (!shouldHomeNavigate || !homeNavigation.navigateTo) return;
		if (!homeNavigation.exit) return;
		navigate(homeNavigation.navigateTo, homeNavigation.navigateOptions);
		setShouldHomeNavigate(false);
	}, [homeNavigation, navigate, setShouldHomeNavigate, shouldHomeNavigate]);

	useEffect(() => {
		if (!shouldHomeSubNavigate || !homeSubNavigation.navigateTo) return;
		if (!homeSubNavigation.exit) return;
		navigate(
			homeSubNavigation.navigateTo,
			homeSubNavigation.navigateOptions,
		);
		setShouldHomeSubNavigate(false);
	}, [
		homeSubNavigation,
		navigate,
		setShouldHomeSubNavigate,
		shouldHomeSubNavigate,
	]);

	useEffect(() => {
		setHomeNavigation({
			navigateTo: null,
			navigateOptions: {},
			exit: {},
		});
		setHomeSubNavigation({
			navigateTo: null,
			navigateOptions: {},
			exit: {},
		});
		if (location.pathname.endsWith(LLOWER_HOME_NAV_ROUTES.HISTORY)) {
			setActiveRoute(LLOWER_HOME_NAV_ROUTES.HISTORY);
		} else if (
			location.pathname.endsWith(LLOWER_HOME_NAV_ROUTES.NEW_TASK)
		) {
			setActiveRoute(LLOWER_HOME_NAV_ROUTES.NEW_TASK);
		} else if (
			location.pathname.endsWith(LLOWER_HOME_NAV_ROUTES.NEW_REMINDER)
		) {
			setActiveRoute(LLOWER_HOME_NAV_ROUTES.NEW_REMINDER);
		} else {
			setActiveRoute(LLOWER_HOME_NAV_ROUTES.SELF);
		}
	}, [
		location.pathname,
		setActiveRoute,
		setHomeNavigation,
		setHomeSubNavigation,
	]);

	return (
		<motion.div
			className={` ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} h-full w-full select-none`}
			{...entry}
			{...homeNavigation.exit}
		>
			{currentUserProfile === undefined ||
			userSettings === undefined ||
			links === undefined ||
			notes === undefined ||
			reminders === undefined ||
			tasks === undefined ||
			visualBMs === undefined ? (
				!hasLoadedOnce ? (
					<LUILoading />
				) : null
			) : (
				<div
					className={`relative flex h-full w-full flex-col overflow-y-hidden`}
				>
					<div className={`w-full grow overflow-y-hidden`}>
						<Outlet
							context={{
								currentUserProfile,
								userSettings,
								links,
								notes,
								reminders,
								tasks,
								visualBMs,
							}}
						/>
					</div>
					<LUIHomeNav />
				</div>
			)}
		</motion.div>
	);
};

export { Page as LUIHome };
