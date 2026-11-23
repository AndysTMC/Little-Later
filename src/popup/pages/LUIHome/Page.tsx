import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { AnimatePresence, motion } from "framer-motion";
import { LUIHomeNav } from "../../components/LUINavs/LUIHomeNav/Component";
import { useLocation, useOutlet } from "react-router";
import { useCallback, useRef, useState, type UIEvent } from "react";
import { pageVariants, readMove } from "../../../route-transitions";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import {
	useImages,
	useLinks,
	useNotes,
	useReminders,
	useSaves,
	useTasks,
} from "../../hooks/useRecords";
import type { HomeData } from "../../records";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUINotificationsOff } from "../../components/LUINotificationsOff/Component";
import {
	useNotificationsAllowed,
	useRefusedReminderToasts,
} from "../../hooks/useNotificationProblems";

const Page = () => {
	const { theme } = useTheme();
	const location = useLocation();
	const pageMotion = usePageMotion();

	const currentUserProfile = useCurrentUserProfile();
	const userSettings = useCurrentUserSettings();
	const links = useLinks();
	const notes = useNotes();
	const images = useImages();
	const reminders = useReminders();
	const tasks = useTasks();
	const pages = useSaves();
	const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
	const notificationsAllowed = useNotificationsAllowed();
	useRefusedReminderToasts(currentUserProfile?.id, reminders);
	const allReady =
		currentUserProfile !== undefined &&
		userSettings !== undefined &&
		links !== undefined &&
		notes !== undefined &&
		images !== undefined &&
		reminders !== undefined &&
		tasks !== undefined &&
		pages !== undefined;
	if (allReady && !hasLoadedOnce) {
		setHasLoadedOnce(true);
	}
	// The panel whose move has finished: Home's own on first open, then
	// each panel's as it opens.
	const [settledPath, setSettledPath] = useState<string | null>(null);
	const settle = (definition: unknown) => {
		if (definition === "animate") setSettledPath(location.pathname);
	};

	const isListRoute =
		location.pathname === "/home" || location.pathname === "/home/history";
	const [hiddenOnPath, setHiddenOnPath] = useState<string | null>(null);
	const navHidden = isListRoute && hiddenOnPath === location.pathname;
	const lastScrollRef = useRef<{ target: HTMLElement | null; top: number }>({
		target: null,
		top: 0,
	});
	const showNav = useCallback(() => {
		setHiddenOnPath(null);
	}, []);
	const handleScrollCapture = (event: UIEvent<HTMLDivElement>) => {
		if (!isListRoute) return;
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		if (target.closest('[role="menu"]')) return;
		if (target.scrollHeight <= target.clientHeight + 32) return;
		const top = Math.max(0, target.scrollTop);
		if (lastScrollRef.current.target !== target) {
			lastScrollRef.current = { target, top };
			return;
		}
		const delta = top - lastScrollRef.current.top;
		lastScrollRef.current.top = top;
		if (top <= 16 || delta < -4) {
			setHiddenOnPath(null);
		} else if (delta > 8 && top > 48) {
			setHiddenOnPath(location.pathname);
		}
	};

	const data = {
		currentUserProfile,
		userSettings,
		links,
		notes,
		images,
		reminders,
		tasks,
		pages,
		ready: settledPath === location.pathname,
		navHidden,
		showNav,
	} as HomeData;
	const panel = useOutlet(data);
	// A panel opening or closing moves within Home; Home itself stays.
	const panelMove = readMove(location.state);

	return (
		<motion.div
			className={` ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} h-full w-full select-none`}
			{...pageMotion}
			onAnimationComplete={settle}
		>
			{!allReady ? (
				!hasLoadedOnce ? (
					<LUILoading />
				) : null
			) : (
				<div
					className={`relative flex h-full w-full flex-col overflow-y-hidden`}
				>
					{notificationsAllowed ? null : <LUINotificationsOff />}
					{/* Clipped both ways: with only one axis hidden, the
					    other scrolls, and a panel sliding sideways showed a
					    scrollbar. */}
					<div
						className={`w-full grow overflow-hidden`}
						onScrollCapture={handleScrollCapture}
					>
						<AnimatePresence
							mode="wait"
							initial={false}
							custom={panelMove}
						>
							<motion.div
								key={location.pathname}
								className="h-full w-full"
								variants={pageVariants}
								custom={panelMove}
								initial="initial"
								animate="animate"
								exit="exit"
								onAnimationComplete={settle}
							>
								{panel}
							</motion.div>
						</AnimatePresence>
					</div>
					<div
						onFocusCapture={showNav}
						className={
							isListRoute
								? `absolute inset-x-0 bottom-0 z-20 transition-transform duration-200 ease-out ${
										navHidden
											? "pointer-events-none translate-y-full"
											: "translate-y-0"
									}`
								: "z-20 shrink-0"
						}
					>
						<LUIHomeNav />
					</div>
				</div>
			)}
		</motion.div>
	);
};

export { Page as LUIHome };
