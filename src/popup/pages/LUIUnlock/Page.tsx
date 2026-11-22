import { motion } from "framer-motion";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { LTHEME } from "little-shared/enums";
import { useParams } from "react-router";
import { send } from "../../../utils/send";
import { isFirstTimeUser } from "../../../services/settings";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import {
	LUIAuthGate,
	type UnlockFactor,
} from "../../components/LUIAuthGate/Component";
import { finishCeremonyWindow } from "../../ceremonyWindow";
import { useUserProfiles } from "../../hooks/useUserProfiles";
import { useEffect } from "react";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIEmptyState } from "../../components/LUIEmptyState/Component";

const Page = () => {
	const { theme, showLookOf } = useTheme();
	const go = useMoveNavigate();

	const pageMotion = usePageMotion();

	const { id } = useParams();

	const userProfiles = useUserProfiles();
	const savedUP = userProfiles?.find((profile) => profile.id === id);

	const loading = useLoading([userProfiles]);

	// Errors reach the gate, which shows them by the password field.
	const handleUnlock = async (password?: string, factor?: UnlockFactor) => {
		if (savedUP === undefined) {
			return;
		}
		await send("profile.unlock", {
			profileId: savedUP.id,
			password: password ?? null,
			factor,
		});
		// Unlocked in the security key's own window: back to the toolbar.
		if (await finishCeremonyWindow()) return;
		const firstTime = await isFirstTimeUser();
		go(firstTime ? "/getting-started" : "/home", "into");
	};
	// The profile's own theme and accent, which are plain like its photo.
	useEffect(() => {
		showLookOf(savedUP ?? null);
		return () => showLookOf(null);
	}, [savedUP, showLookOf]);

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
