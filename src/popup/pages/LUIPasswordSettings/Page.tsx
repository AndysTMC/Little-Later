import { motion } from "framer-motion";
import { UserCircleIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIPasswordForm } from "../../components/LUIPasswordForm/Component";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useLoading } from "../../hooks/useLoading";
import { useObjectUrl } from "../../hooks/useObjectUrl";
import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { useUserAvatar } from "../../hooks/useUserAvatar";
import { send } from "../../../utils/send";

// Sets, changes or removes the profile's password, opened from Security.
// Laid out like the unlock and lock screens: a password is set where it is
// typed.
const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const profile = useCurrentUserProfile();
	const loading = useLoading([profile]);
	const avatarUrl = useObjectUrl(useUserAvatar(profile?.id));
	const isDark = theme === LTHEME.DARK;
	const text = isDark ? "text-white" : "text-black";

	return (
		<motion.div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${isDark ? "bg-black" : "bg-white"}`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo="/settings/security" />
			{loading || !profile ? (
				<LUILoading />
			) : (
				<div className="flex min-h-0 w-full grow flex-col items-center gap-y-5">
					<h1
						className={`mt-5 flex shrink-0 items-center justify-center text-4xl font-semibold ${text}`}
					>
						{profile.hasPassword
							? "Change password"
							: "Set a password"}
					</h1>
					{/* Scrolls rather than squeezing its parts when they do not fit. */}
					<div className="flex min-h-0 w-full grow flex-col items-center gap-y-5 overflow-y-auto px-12 pt-5 pb-4">
						<div className="flex w-full shrink-0 items-center justify-center pt-5">
							{avatarUrl ? (
								<img
									src={avatarUrl}
									alt={`${profile.name} avatar`}
									className="h-32 w-32 rounded-full object-cover"
									draggable={false}
								/>
							) : (
								<LUIThemedIcon
									Icon={UserCircleIcon}
									weight="fill"
									className="size-32"
								/>
							)}
						</div>
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
					</div>
				</div>
			)}
		</motion.div>
	);
};

export { Page as LUIPasswordSettings };
