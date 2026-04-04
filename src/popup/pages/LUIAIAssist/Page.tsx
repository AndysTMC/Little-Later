import { useLittleTransition } from "../../hooks/useLittleTransition";
import { useTheme } from "../../hooks/useTheme";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIAIAssistMain } from "../../components/LUIAIAssistMain/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { useLinks } from "../../hooks/useLinks";
import { useNotes } from "../../hooks/useNotes";
import { useReminders } from "../../hooks/useReminders";
import { useVisualBMs } from "../../hooks/useVisualBMs";
import { useTasks } from "../../hooks/useTasks";
import { LUILoading } from "../../components/LUILoading/Component";
import { useLoading } from "../../hooks/useLoading";

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.zoomOut,
	});

	const currentUserProfile = useCurrentUserProfile();
	const userSettings = useCurrentUserSettings();
	const links = useLinks();
	const notes = useNotes();
	const reminders = useReminders();
	const visualBMs = useVisualBMs();
	const tasks = useTasks();
	const loading = useLoading([
		currentUserProfile,
		userSettings,
		userSettings?.ai,
		links,
		notes,
		reminders,
		visualBMs,
		tasks,
	]);

	return (
		<motion.div
			className={`h-full w-full select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"}`}
			{...entry}
			{...exit}
		>
			{loading ? (
				<LUILoading />
			) : (
				<motion.div
					className={`flex h-full w-full flex-col overflow-y-hidden`}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
				>
					<LUIBasicNav
						navigateTo="/home"
						entryTransition={entryTransitions.zoomOut}
					/>
					<div className={`w-full grow overflow-y-hidden`}>
						<LUIAIAssistMain
							links={links!}
							notes={notes!}
							reminders={reminders!}
							saves={visualBMs!}
							tasks={tasks!}
						/>
					</div>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIAIAssist };
