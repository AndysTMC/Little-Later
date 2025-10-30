import { motion } from "framer-motion";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { LTHEME } from "little-shared/enums";
import { useNavigate, useParams } from "react-router";
import { unlockUser } from "../../../services/user";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIAuthGate } from "../../components/LUIAuthGate/Component";
import { LUserProfile } from "little-shared/types";
import { useUserProfiles } from "../../hooks/useUserProfiles";
import { useEffect, useState } from "react";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";

const Page = () => {
	const { theme } = useTheme();
	const navigate = useNavigate();

	const { entry, exit, setExit } = useLittleTransition({
		defaultExit: exitTransitions.zoomOut,
	});

	const { id } = useParams();

	const userProfiles = useUserProfiles();

	const [savedUP, setSavedUP] = useState<LUserProfile | undefined>();

	const loading = useLoading([userProfiles]);

	const handleUnlock = async (password?: string) => {
		if (savedUP === undefined) {
			return;
		}
		await unlockUser(savedUP.userId, password);
		setExit(exitTransitions.zoomIn);
		navigate("/home", {
			state: { entryTransition: entryTransitions.zoomIn },
		});
	};
	useEffect(() => {
		if (userProfiles) {
			const up = userProfiles?.find(
				(x) => id && x.userId == parseInt(id),
			) as LUserProfile | undefined;
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
					<LUIAuthGate
						type="Unlock"
						userProfile={savedUP!}
						handleFunction={handleUnlock}
					/>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIUnlock };
