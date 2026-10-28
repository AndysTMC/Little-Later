import { useLittleTransition } from "../../hooks/useLittleTransition";
import { exitTransitions } from "../../../route-transitions";
import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIReminderForm } from "../../components/LUIReminderForm/Component";
import { useParams } from "react-router";
import {
	useLinks,
	useReminders,
	useSaves,
	useTasks,
} from "../../hooks/useRecords";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIEmptyState } from "../../components/LUIEmptyState/Component";

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});
	const links = useLinks();
	const reminders = useReminders();
	const pages = useSaves();
	const tasks = useTasks();
	const { id } = useParams();
	const loading = useLoading([id, links, reminders, pages, tasks]);
	const reminder = reminders?.find((item) => item.id === id);

	return (
		<motion.div
			className={`h-full w-full select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} `}
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
					<LUIBasicNav navigateTo="/home" />
					{reminder ? (
						<LUIReminderForm
							key={reminder.id}
							reminder={reminder}
							links={links!}
							saves={pages!.filter((page) => page.saved)}
							tasks={tasks!}
						/>
					) : (
						<LUIEmptyState title="Reminder not found." />
					)}
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIReminder };
