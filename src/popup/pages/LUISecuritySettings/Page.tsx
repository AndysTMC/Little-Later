import { motion } from "framer-motion";
import { LTHEME } from "little-shared/enums";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISettingLink } from "../../components/LUISettingRow/Component";
import { LUINote } from "../../components/LUINote/Component";
import { LUILoading } from "../../components/LUILoading/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useLoading } from "../../hooks/useLoading";
import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";

// How the profile is protected: password and two-factor unlock. Retention,
// ignored sites and external MCP live under Data & Privacy.
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
					<div className="flex w-full flex-col gap-y-2.5 pt-1 pb-4">
						<LUISettingLink
							label={
								profile.hasPassword
									? "Change password"
									: "Set a password"
							}
							to="/settings/security/password"
							referrer="/settings/security"
						/>
						{profile.hasPassword ? (
							<LUISettingLink
								label="Two-factor unlock"
								to="/settings/security/two-factor"
								referrer="/settings/security"
							/>
						) : null}
						<LUINote className="w-full">
							{profile.hasPassword
								? "Your password protects what you save. Your profile name, photo and reminder times stay readable while locked, so reminders can still fire. The profile also locks when the browser starts or your screen locks."
								: "Without a password, this profile is not encrypted at rest: anyone using this browser profile can open it."}
						</LUINote>
					</div>
				</LUISettingsLayout>
			)}
		</motion.div>
	);
};

export { Page as LUISecuritySettings };
