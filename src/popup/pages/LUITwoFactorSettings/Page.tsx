import { motion } from "framer-motion";
import { LTHEME } from "little-shared/enums";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISettingLink } from "../../components/LUISettingRow/Component";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUINote } from "../../components/LUINote/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useLoading } from "../../hooks/useLoading";
import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { TWO_FACTOR_ROUTE, addedOn } from "../../twoFactor";

// Two-factor unlock (decision 0015), laid out like the other settings
// pages: a row per key and per action, the note below. Every change is
// confirmed with the password on a page of its own (LUITwoFactorAction).
const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const profile = useCurrentUserProfile();
	const loading = useLoading([profile]);
	const isDark = theme === LTHEME.DARK;
	const on = profile?.authenticators != null;

	return (
		<motion.div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${isDark ? "bg-black" : "bg-white"}`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo="/settings/security" />
			{loading || !profile ? (
				<LUILoading />
			) : (
				<LUISettingsLayout pageName="Two-factor unlock">
					<div className="flex w-full flex-col gap-y-3 pt-1 pb-4">
						{profile.hasPassword ? (
							<div className="flex w-full flex-col">
								{profile.authenticators?.map((entry) => (
									<LUISettingLink
										key={entry.credentialId}
										label={`${entry.name} · added ${addedOn(entry.addedAt)}`}
										to={`${TWO_FACTOR_ROUTE}/remove/${encodeURIComponent(entry.credentialId)}`}
										referrer={TWO_FACTOR_ROUTE}
									/>
								))}
								<LUISettingLink
									label={on ? "Add another key" : "Add a key"}
									to={`${TWO_FACTOR_ROUTE}/add`}
									referrer={TWO_FACTOR_ROUTE}
								/>
								{on ? (
									<>
										<LUISettingLink
											label="New recovery code"
											to={`${TWO_FACTOR_ROUTE}/recovery-code`}
											referrer={TWO_FACTOR_ROUTE}
										/>
										<LUISettingLink
											label="Turn off two-factor unlock"
											to={`${TWO_FACTOR_ROUTE}/off`}
											referrer={TWO_FACTOR_ROUTE}
										/>
									</>
								) : null}
							</div>
						) : null}
						<LUINote className="w-full">
							{!profile.hasPassword
								? "Set a password first: two-factor unlock adds a security key or passkey to the password."
								: on
									? "Unlocking needs the password and one of these keys. Keep the recovery code safe: without a key or the code, the profile can't be opened. Choose a key to remove it."
									: "Add a security key or passkey, and unlocking will need it as well as the password. It needs PRF support: a recent security key, or a passkey in Google Password Manager."}
						</LUINote>
					</div>
				</LUISettingsLayout>
			)}
		</motion.div>
	);
};

export { Page as LUITwoFactorSettings };
