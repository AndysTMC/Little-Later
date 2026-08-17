import { motion } from "framer-motion";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
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
import { createToast } from "../../../services/toasts";

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
		try {
			await unlockUser(savedUP.userId, password);
			setExit(exitTransitions.zoomIn);
			navigate("/home", {
				state: { entryTransition: entryTransitions.zoomIn },
			});
		} catch (error) {
			console.error("Failed to unlock profile.", error);
			await createToast(
				error instanceof Error
					? error.message
					: "Couldn't unlock this profile.",
				LTOAST_TYPE.ERROR,
			);
		}
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
					{savedUP ? (
						<LUIAuthGate
							type="Unlock"
							userProfile={savedUP}
							handleFunction={handleUnlock}
						/>
					) : (
						<div
							className={`flex h-full w-full items-center justify-center px-6 text-center text-2xl font-extrabold opacity-20 ${
								theme === LTHEME.DARK
									? "text-white"
									: "text-black"
							}`}
						>
							Profile not found.
						</div>
					)}
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIUnlock };
