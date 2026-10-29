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
import { send } from "../../../utils/send";
import { sendAvatar } from "../../../utils/avatar";
import { LUIPasswordForm } from "../../components/LUIPasswordForm/Component";
import { useUserAvatar } from "../../hooks/useUserAvatar";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LMAX_NAME_LENGTH } from "little-shared/constants";

// Auto-lock after this many idle minutes (0010, Locking).
const AUTO_LOCK_CHOICES = [5, 15, 30, 60, 240];
const autoLockLabel = (minutes: number) =>
	minutes < 60
		? `${minutes} minutes`
		: `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;

const Page = () => {
	const { theme, toggleTheme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});

	const currentUserProfile = useCurrentUserProfile();

	const loading = useLoading([currentUserProfile]);

	const currentUserAvatar = useUserAvatar(currentUserProfile?.id);

	const [name, setName] = useState(currentUserProfile?.name ?? "");

	const avatarInputRef = useRef<HTMLInputElement>(null);

	const handleUpdateAvatar = async (avatar: Blob | null) => {
		if (currentUserProfile === undefined) {
			return;
		}
		await sendAvatar(avatar);
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
			const trimmed = name.trim();
			if (trimmed === "" || trimmed.length > LMAX_NAME_LENGTH) {
				return;
			}
			await send("profile.update", { name: trimmed });
		}, 1000);
		return () => clearTimeout(timeout);
	}, [name, currentUserProfile]);

	const validateName = (name: string) => {
		if (name.length > LMAX_NAME_LENGTH) {
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
										avatar={currentUserAvatar ?? null}
										setAvatar={handleUpdateAvatar}
										avatarInputRef={avatarInputRef}
										theme={theme}
									/>
								</div>
								<LUITextInputT1
									name="Name"
									passedValue={name}
									onChange={handleUpdateName}
									lengthLimit={LMAX_NAME_LENGTH}
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
							{currentUserProfile ? (
								<>
									<div
										className={`flex h-full w-full flex-col gap-y-1`}
									>
										<div
											className={`flex h-max w-full items-center justify-center`}
										>
											<LUILabel
												name={"Lock after idle"}
											/>
										</div>
										<LUISelectT1
											passedItem={autoLockLabel(
												currentUserProfile.autoLockMinutes,
											)}
											items={AUTO_LOCK_CHOICES.map(
												autoLockLabel,
											)}
											onChange={(label) => {
												const minutes =
													AUTO_LOCK_CHOICES.find(
														(choice) =>
															autoLockLabel(
																choice,
															) === label,
													);
												if (minutes !== undefined) {
													void send(
														"profile.update",
														{
															autoLockMinutes:
																minutes,
														},
													);
												}
											}}
										/>
									</div>
									<div
										className={`flex h-max w-full flex-col items-center gap-y-2 pb-4`}
									>
										<LUILabel name={"Password"} />
										<LUIPasswordForm
											hasPassword={
												currentUserProfile.hasPassword
											}
											onSubmit={(
												oldPassword,
												newPassword,
											) =>
												send("profile.changePassword", {
													profileId:
														currentUserProfile.id,
													oldPassword,
													newPassword,
												}).then(() => undefined)
											}
										/>
									</div>
								</>
							) : null}
						</div>
					</LUISettingsLayout>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIProfile };
