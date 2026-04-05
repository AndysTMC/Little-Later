import { useLittleTransition } from "../../hooks/useLittleTransition";
import { useTheme } from "../../hooks/useTheme";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIAIAssistMain } from "../../components/LUIAIAssistMain/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { LUILoading } from "../../components/LUILoading/Component";
import { useLoading } from "../../hooks/useLoading";

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.zoomOut,
	});

	const currentUserProfile = useCurrentUserProfile();
	const userSettings = useCurrentUserSettings();
	const loading = useLoading([
		currentUserProfile,
		userSettings,
		userSettings?.ai,
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
						<LUIAIAssistMain />
					</div>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIAIAssist };
