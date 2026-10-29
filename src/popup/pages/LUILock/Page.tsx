import { motion } from "framer-motion";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
import { send } from "../../../utils/send";
import { createToast } from "../../../services/toasts";
import { useNavigate } from "react-router";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIAuthGate } from "../../components/LUIAuthGate/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useEffect, useState } from "react";
import type { UserProfile } from "../../hooks/useUserProfiles";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIEmptyState } from "../../components/LUIEmptyState/Component";

const Page = () => {
	const { theme, setTheme } = useTheme();
	const navigate = useNavigate();

	const { entry, exit, setExit } = useLittleTransition({
		defaultExit: exitTransitions.zoomIn,
	});

	const currentUserProfile = useCurrentUserProfile();
	const [savedUP, setSavedUP] = useState<UserProfile | undefined>();

	const handleLock = async () => {
		if (currentUserProfile === undefined) {
			return;
		}
		try {
			await send("profile.lock", null);
			setExit(exitTransitions.zoomOut);
			setTheme(LTHEME.LIGHT);
			navigate("/browse-profiles", {
				state: { entryTransition: entryTransitions.zoomOut },
			});
		} catch (error) {
			console.error("Failed to lock profile.", error);
			await createToast(
				error instanceof Error
					? error.message
					: "Couldn't lock this profile.",
				LTOAST_TYPE.ERROR,
			);
		}
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
					{savedUP ? (
						<LUIAuthGate
							type="Lock"
							userProfile={savedUP}
							handleFunction={handleLock}
						/>
					) : (
						<LUIEmptyState title="No profile to lock." />
					)}
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUILock };
