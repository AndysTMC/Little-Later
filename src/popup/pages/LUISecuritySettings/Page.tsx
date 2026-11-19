import { motion } from "framer-motion";
import { InfoIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISettingLink } from "../../components/LUISettingRow/Component";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { LUILoading } from "../../components/LUILoading/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useLoading } from "../../hooks/useLoading";
import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";

// How the profile is protected. The password is changed on its own page;
// when the profile locks itself is under Misc.
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
			<LUIBasicNav navigateTo="/settings" />
			{loading || !profile ? (
				<LUILoading />
			) : (
				<LUISettingsLayout pageName="Security">
					<div className="flex w-full flex-col gap-y-3 pt-1 pb-4">
						<LUISettingLink
							label={
								profile.hasPassword
									? "Change password"
									: "Set a password"
							}
							to="/settings/security/password"
							referrer="/settings/security"
						/>
						<div
							className={`flex w-full gap-x-2 text-sm italic ${isDark ? "text-neutral-300" : "text-neutral-600"}`}
						>
							<LUIThemedIcon
								Icon={InfoIcon}
								weight="fill"
								className="h-5 w-5 shrink-0"
							/>
							<p>
								{profile.hasPassword
									? "Your password protects what you save. Your profile name, photo and reminder times stay readable while locked, so reminders can still fire. The profile also locks when the browser starts or your screen locks."
									: "Without a password, this profile is not encrypted at rest: anyone using this browser profile can open it."}
							</p>
						</div>
					</div>
				</LUISettingsLayout>
			)}
		</motion.div>
	);
};

export { Page as LUISecuritySettings };
