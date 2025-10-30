import { motion } from "framer-motion";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { LTHEME } from "little-shared/enums";
import { lockUser } from "../../../services/user";
import { useNavigate } from "react-router";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIAuthGate } from "../../components/LUIAuthGate/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useEffect, useState } from "react";
import { LUserProfile } from "little-shared/types";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";

const Page = () => {
	const { theme, setTheme } = useTheme();
	const navigate = useNavigate();

	const { entry, exit, setExit } = useLittleTransition({
		defaultExit: exitTransitions.zoomIn,
	});

	const currentUserProfile = useCurrentUserProfile();
	const [savedUP, setSavedUP] = useState<LUserProfile | undefined>();

	const handleLock = async (password?: string) => {
		if (currentUserProfile === undefined) {
			return;
		}
		setExit(exitTransitions.zoomOut);
		await lockUser({ password });
		setTheme(LTHEME.LIGHT);
		navigate("/browse-profiles", {
			state: { entryTransition: entryTransitions.zoomOut },
		});
	};

	useEffect(() => {
		if (currentUserProfile) {
			setSavedUP(currentUserProfile);
		}
	}, [currentUserProfile]);

	const loading = useLoading([savedUP]);

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
						entryTransition={entryTransitions.zoomIn}
					/>
					<LUIAuthGate
						type="Lock"
						userProfile={savedUP!}
						handleFunction={handleLock}
					/>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUILock };
