import { motion } from "framer-motion";
import { exitTransitions } from "../../../route-transitions";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { LTHEME } from "little-shared/enums";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUIAvatarInput } from "../../components/LUIAvatarInput/Component";
import { LUITextInputT1 } from "../../components/LUITextInput/Component";
import { LUILabel } from "../../components/LUILabel/Component";
import { LUISelectT1 } from "../../components/LUISelectT1/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { updateUserAvatar, updateUserProfile } from "../../../services/user";
import { useUserAvatar } from "../../hooks/useUserAvatar";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";

const Page = () => {
	const { theme, toggleTheme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});

	const currentUserProfile = useCurrentUserProfile();

	const loading = useLoading([currentUserProfile]);

	const currentUserAvatar = useUserAvatar(currentUserProfile?.userId);

	const [name, setName] = useState(currentUserProfile?.name ?? "");

	const avatarInputRef = useRef<HTMLInputElement>(null);

	const handleUpdateAvatar = async (avatar: Blob | null) => {
		if (currentUserProfile === undefined) {
			return;
		}
		await updateUserAvatar(currentUserProfile.userId, avatar);
	};

	const handleUpdateName = (name: string) => {
		setName(name);
	};

	useEffect(() => {
		if (currentUserProfile !== undefined) {
			setName(currentUserProfile.name);
		}
	}, [currentUserProfile]);

	useEffect(() => {
		if (currentUserProfile === undefined) {
			return;
		}
		const timeout = setTimeout(async () => {
			if (name === currentUserProfile.name) {
				return;
			}
			await updateUserProfile(currentUserProfile.userId, { name });
		}, 1000);
		return () => clearTimeout(timeout);
	}, [name, currentUserProfile]);

	const validateName = (name: string) => {
		if (name.length > 32) {
			return { success: false, error: "Name is too long" };
		}
		return { success: true, error: "" };
	};

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
					<LUIBasicNav navigateTo="/home" />
					<LUISettingsLayout pageName="Profile">
						<div
							className={`flex w-full grow flex-col justify-start gap-y-2 pt-3`}
						>
							<div
								className={`flex w-full grow flex-col items-center justify-start gap-y-5 pt-2 pb-1`}
							>
								<div
									className={`flex h-max w-full items-center justify-center`}
								>
									<LUIAvatarInput
										avatar={currentUserAvatar?.blob ?? null}
										setAvatar={handleUpdateAvatar}
										avatarInputRef={avatarInputRef}
										theme={theme}
									/>
								</div>
								<LUITextInputT1
									name="Name"
									passedValue={name}
									onChange={handleUpdateName}
									lengthLimit={32}
									validate={validateName}
								/>
							</div>
							<div
								className={`flex h-full w-full flex-col gap-y-1`}
							>
								<div
									className={`flex h-max w-full items-center justify-center`}
								>
									<LUILabel name={"Theme"} />
								</div>
								<LUISelectT1
									passedItem={
										theme === LTHEME.LIGHT
											? "Little Light"
											: "Little Dark"
									}
									items={["Little Light", "Little Dark"]}
									onChange={toggleTheme}
								/>
							</div>
						</div>
					</LUISettingsLayout>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIProfile };
