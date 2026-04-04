import { motion } from "framer-motion";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { useNavigate, useOutletContext } from "react-router";
import { LUIBasicNav } from "../LUINavs/LUIBasicNav/Component";
import { LUITaskForm } from "../LUITaskForm/Component";
import { LLink, LTask, LVisualBM } from "little-shared/types";
import { twMerge } from "tailwind-merge";

const Component = () => {
	const {
		className,
		links,
		tasks,
		visualBMs,
	}: {
		className?: string;
		links: Array<LLink>;
		tasks: Array<LTask>;
		visualBMs: Array<LVisualBM>;
	} = useOutletContext();
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		transitionName: "subEntryTransition",
		defaultExit: exitTransitions.slideUpToDown,
	});
	const navigate = useNavigate();

	const additionalSubmitCallback = () => {
		navigate("/home", {
			state: { subEntryTransition: entryTransitions.slideUp },
		});
	};
	const saves = visualBMs.filter((visualBM) => visualBM.isSaved);
	return (
		<motion.div
			className={twMerge(
				`flex h-full w-full flex-col overflow-y-hidden select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"}`,
				className,
			)}
			{...entry}
			{...exit}
		>
			<LUIBasicNav goBackDisabled />
			<LUITaskForm
				links={links}
				saves={saves}
				tasks={tasks}
				additionalSubmitCallback={additionalSubmitCallback}
			/>
		</motion.div>
	);
};

export { Component as LUITaskCreator };
