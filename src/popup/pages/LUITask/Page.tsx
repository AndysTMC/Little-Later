import { useLittleTransition } from "../../hooks/useLittleTransition";
import { exitTransitions } from "../../../route-transitions";
import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { useParams } from "react-router";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUITaskForm } from "../../components/LUITaskForm/Component";
import { useLinks } from "../../hooks/useLinks";
import { useVisualBMs } from "../../hooks/useVisualBMs";
import { useTasks } from "../../hooks/useTasks";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});
	const links = useLinks();
	const visualBMs = useVisualBMs();
	const saves = visualBMs?.filter((x) => x.isSaved);
	const tasks = useTasks();
	const { id } = useParams();
	const loading = useLoading([id, links, saves, tasks]);
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
					<LUITaskForm
						id={parseInt(id!)}
						links={links!}
						saves={saves!}
						tasks={tasks!}
					/>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUITask };
