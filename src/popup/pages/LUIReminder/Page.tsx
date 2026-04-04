import { useLittleTransition } from "../../hooks/useLittleTransition";
import { exitTransitions } from "../../../route-transitions";
import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIReminderForm } from "../../components/LUIReminderForm/Component";
import { useParams } from "react-router";
import { useLinks } from "../../hooks/useLinks";
import { useReminders } from "../../hooks/useReminders";
import { useVisualBMs } from "../../hooks/useVisualBMs";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});
	const links = useLinks();
	const reminders = useReminders();
	const visualBMs = useVisualBMs();
	const saves = visualBMs?.filter((visualBM) => visualBM.isSaved);
	const { id } = useParams();
	const loading = useLoading([id, links, reminders, saves]);

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
					<LUIReminderForm
						id={parseInt(id!)}
						links={links!}
						reminders={reminders!}
						saves={saves!}
					/>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIReminder };
