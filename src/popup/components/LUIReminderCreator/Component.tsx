import { motion } from "framer-motion";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { useLocation, useNavigate, useOutletContext } from "react-router";
import { LUIBasicNav } from "../LUINavs/LUIBasicNav/Component";
import { LUIReminderForm } from "../LUIReminderForm/Component";
import type { HomeData } from "../../records";

const Component = () => {
	const { links, pages } = useOutletContext<HomeData>();
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		transitionName: "subEntryTransition",
		defaultExit: exitTransitions.slideUpToDown,
	});
	const navigate = useNavigate();
	const location = useLocation();
	const prelinkedSaveId =
		typeof location.state?.passedSaveId === "string"
			? location.state.passedSaveId
			: undefined;
	const additionalSubmitCallback = () => {
		navigate("/home", {
			state: { subEntryTransition: entryTransitions.slideUp },
		});
	};
	const saves = pages.filter((page) => page.saved);
	return (
		<motion.div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"}`}
			{...entry}
			{...exit}
		>
			<LUIBasicNav goBackDisabled />
			<LUIReminderForm
				links={links}
				saves={saves}
				prelinkedSaveId={prelinkedSaveId}
				additionalSubmitCallback={additionalSubmitCallback}
			/>
		</motion.div>
	);
};

export { Component as LUIReminderCreator };
