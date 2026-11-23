import { usePageMotion } from "../../hooks/usePageMove";
import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIVBMForm } from "../../components/LUIVBMForm/Component";
import {
	useLinks,
	useNotes,
	useProfileTags,
	useReminders,
	useSaves,
	useTasks,
} from "../../hooks/useRecords";
import { useParams } from "react-router";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIEmptyState } from "../../components/LUIEmptyState/Component";

const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();

	const { id } = useParams();
	const links = useLinks();
	const notes = useNotes();
	const reminders = useReminders();
	const pages = useSaves();
	const tasks = useTasks();
	const loading = useLoading([id, links, notes, reminders, pages, tasks]);
	const save = pages?.find((page) => page.saved && page.id === id);
	const tagSuggestions = useProfileTags();

	return (
		<motion.div
			className={`h-full w-full select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} `}
			{...pageMotion}
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
					{save ? (
						<LUIVBMForm
							key={save.id}
							links={links!}
							notes={notes!}
							reminders={reminders!}
							tasks={tasks!}
							save={save}
							tagSuggestions={tagSuggestions}
						/>
					) : (
						<LUIEmptyState title="Save not found." />
					)}
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIVBM };
