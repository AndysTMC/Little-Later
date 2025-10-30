import { useLittleTransition } from "../../hooks/useLittleTransition";
import { exitTransitions } from "../../../route-transitions";
import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISaveForm } from "../../components/LUISaveForm/Component";
import { useLinks } from "../../hooks/useLinks";
import { useNotes } from "../../hooks/useNotes";
import { useReminders } from "../../hooks/useReminders";
import { useVisualBMs } from "../../hooks/useVisualBMs";
import { useTasks } from "../../hooks/useTasks";
import { useParams } from "react-router";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});

	const { id } = useParams();
	const links = useLinks();
	const notes = useNotes();
	const reminders = useReminders();
	const visualBMs = useVisualBMs();
	const saves = visualBMs?.filter((x) => x.isSaved);
	const tasks = useTasks();
	const loading = useLoading([id, links, notes, reminders, saves, tasks]);

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
					<LUISaveForm
						links={links!}
						notes={notes!}
						reminders={reminders!}
						saves={saves!}
						tasks={tasks!}
						id={parseInt(id!)}
					/>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUISave };
