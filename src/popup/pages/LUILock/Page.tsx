import { motion } from "framer-motion";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
import { send } from "../../../utils/send";
import { createToast } from "../../../services/toasts";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIAuthGate } from "../../components/LUIAuthGate/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useState } from "react";
import type { UserProfile } from "../../hooks/useUserProfiles";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIEmptyState } from "../../components/LUIEmptyState/Component";

const Page = () => {
	const { theme } = useTheme();
	const go = useMoveNavigate();

	const pageMotion = usePageMotion();

	const currentUserProfile = useCurrentUserProfile();
	// Keep the last unlocked profile while the lock exit transition runs.
	const [lastProfile, setLastProfile] = useState<UserProfile | undefined>(
		currentUserProfile,
	);
	if (currentUserProfile && currentUserProfile !== lastProfile) {
		setLastProfile(currentUserProfile);
	}
	const savedUP = currentUserProfile ?? lastProfile;

	const handleLock = async () => {
		if (currentUserProfile === undefined) {
			return;
		}
		try {
			await send("profile.lock", null);
			go("/browse-profiles", "outOf");
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

	const loading = useLoading([savedUP]);

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
					<LUIBasicNav navigateTo="/home" move="into" />
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
