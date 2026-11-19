import { motion } from "framer-motion";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { LTHEME } from "little-shared/enums";
import { useParams } from "react-router";
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
	const { theme, showLookOf } = useTheme();
	const go = useMoveNavigate();

	const pageMotion = usePageMotion();

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
		go(firstTime ? "/getting-started" : "/home", "into");
	};
	// The profile's own theme and accent, which are plain like its photo.
	useEffect(() => {
		showLookOf(savedUP ?? null);
		return () => showLookOf(null);
	}, [savedUP, showLookOf]);
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
			{...pageMotion}
		>
			{loading ? (
				<LUILoading />
			) : (
				<motion.div
					className={`flex h-full w-full flex-col overflow-y-hidden`}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
				>
					<LUIBasicNav navigateTo="/browse-profiles" move="outOf" />
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
