import { useLittleTransition } from "../../hooks/useLittleTransition";
import { exitTransitions } from "../../../route-transitions";
import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { useParams } from "react-router";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUITaskForm } from "../../components/LUITaskForm/Component";
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
	const pages = useSaves();
	const reminders = useReminders();
	const tasks = useTasks();
	const { id } = useParams();
	const loading = useLoading([id, links, pages, reminders, tasks]);
	const task = tasks?.find((item) => item.id === id);
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
					{task ? (
						<LUITaskForm
							key={task.id}
							task={task}
							links={links!}
							reminders={reminders!}
							saves={pages!.filter((page) => page.saved)}
						/>
					) : (
						<LUIEmptyState title="Task not found." />
					)}
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUITask };
