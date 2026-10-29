import { motion } from "framer-motion";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { LTHEME } from "little-shared/enums";
import { useNavigate, useParams } from "react-router";
import { send } from "../../../utils/send";
import { isFirstTimeUser } from "../../../services/settings";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIAuthGate } from "../../components/LUIAuthGate/Component";
import { useUserProfiles, type UserProfile } from "../../hooks/useUserProfiles";
import { useEffect, useState } from "react";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIEmptyState } from "../../components/LUIEmptyState/Component";

const Page = () => {
	const { theme } = useTheme();
	const navigate = useNavigate();

	const { entry, exit, setExit } = useLittleTransition({
		defaultExit: exitTransitions.zoomOut,
	});

	const { id } = useParams();

	const userProfiles = useUserProfiles();

	const [savedUP, setSavedUP] = useState<UserProfile | undefined>();

	const loading = useLoading([userProfiles]);

	// Errors reach the gate, which shows them by the password field.
	const handleUnlock = async (password?: string) => {
		if (savedUP === undefined) {
			return;
		}
		await send("profile.unlock", {
			profileId: savedUP.id,
			password: password ?? null,
		});
		const firstTime = await isFirstTimeUser();
		setExit(exitTransitions.zoomIn);
		navigate(firstTime ? "/getting-started" : "/home", {
			state: { entryTransition: entryTransitions.zoomIn },
		});
	};
	useEffect(() => {
		if (userProfiles) {
			const up = userProfiles.find((profile) => profile.id === id);
			if (up) {
				setSavedUP(up);
			}
		}
	}, [userProfiles, id, setSavedUP]);

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
						navigateTo="/browse-profiles"
						entryTransition={entryTransitions.zoomIn}
					/>
					{savedUP ? (
						<LUIAuthGate
							type="Unlock"
							userProfile={savedUP}
							handleFunction={handleUnlock}
						/>
					) : (
						<LUIEmptyState title="Profile not found." />
					)}
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIUnlock };
