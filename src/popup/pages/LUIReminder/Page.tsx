import { useMemo } from "react";
import { usePageMotion } from "../../hooks/usePageMove";
import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIReminderForm } from "../../components/LUIReminderForm/Component";
import { useParams } from "react-router";
import {
	useLinks,
	useNotes,
	useReminders,
	useSaves,
	useTasks,
} from "../../hooks/useRecords";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIEmptyState } from "../../components/LUIEmptyState/Component";
import { collectProfileTags } from "../../../utils/tags";

const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const links = useLinks();
	const notes = useNotes();
	const reminders = useReminders();
	const pages = useSaves();
	const tasks = useTasks();
	const { id } = useParams();
	const loading = useLoading([id, links, notes, reminders, pages, tasks]);
	const reminder = reminders?.find((item) => item.id === id);
	const savedPages = useMemo(
		() => (pages ?? []).filter((page) => page.saved),
		[pages],
	);
	const tagSuggestions = useMemo(
		() =>
			collectProfileTags([
				savedPages,
				tasks ?? [],
				reminders ?? [],
				notes ?? [],
			]),
		[savedPages, tasks, reminders, notes],
	);

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
					{reminder ? (
						<LUIReminderForm
							key={reminder.id}
							reminder={reminder}
							links={links!}
							saves={savedPages}
							tasks={tasks!}
							tagSuggestions={tagSuggestions}
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
