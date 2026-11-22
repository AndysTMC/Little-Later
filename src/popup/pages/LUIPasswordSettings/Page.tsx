import { motion } from "framer-motion";
import { LTHEME } from "little-shared/enums";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIIdentityPage } from "../../components/LUIIdentityPage/Component";
import { LUIPasswordForm } from "../../components/LUIPasswordForm/Component";
import { LUILoading } from "../../components/LUILoading/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useLoading } from "../../hooks/useLoading";
import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { send } from "../../../utils/send";

// Sets, changes or removes the profile's password, opened from Security.
// An identity screen, like unlock and lock: a password is set where it is
// typed.
const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const profile = useCurrentUserProfile();
	const loading = useLoading([profile]);
	const isDark = theme === LTHEME.DARK;

	return (
		<motion.div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${isDark ? "bg-black" : "bg-white"}`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo="/settings/security" />
			{loading || !profile ? (
				<LUILoading />
			) : (
				<LUIIdentityPage
					title={
						profile.hasPassword
							? "Change password"
							: "Set a password"
					}
					profile={profile}
				>
					<LUIPasswordForm
						hasPassword={profile.hasPassword}
						onSubmit={(oldPassword, newPassword) =>
							send("profile.changePassword", {
								profileId: profile.id,
								oldPassword,
								newPassword,
							}).then(() => undefined)
						}
					/>
					{profile.hasPassword ? (
						<p
							className={`w-72 shrink-0 text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
						>
							To remove the password, type the current one and
							leave the new one empty.
						</p>
					) : null}
				</LUIIdentityPage>
			)}
		</motion.div>
	);
};

export { Page as LUIPasswordSettings };
