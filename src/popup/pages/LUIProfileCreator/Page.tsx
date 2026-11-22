import { useState } from "react";
import { IdentificationBadgeIcon, PasswordIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIAvatarInput } from "../../components/LUIAvatarInput/Component";
import { LUICUButton } from "../../components/LUICUButton/Component";
import { LUIIconField } from "../../components/LUIIconField/Component";
import { LUINote } from "../../components/LUINote/Component";
import { send } from "../../../utils/send";
import { sendAvatar } from "../../../utils/avatar";
import { isFirstTimeUser } from "../../../services/settings";
import { NO_PASSWORD_NOTE, passwordProblem } from "../../passwords";
import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
import { LMAX_NAME_LENGTH } from "little-shared/constants";
import { createToast } from "../../../services/toasts";

import { attempt } from "../../attempt";

import { useDraft } from "../../hooks/useDraft";

import { pickRoute } from "../../filePick";
import { AVATAR_REQUEST } from "../../components/LUIAvatarInput/request";
import { usePickedFile } from "../../hooks/usePickedFile";

const AVATAR_SLOT = "profile.new.avatar";

const Page = () => {
	const pageMotion = usePageMotion();

	const go = useMoveNavigate();
	// The name is remembered if the popup closes; the password never is.
	const [name, setName, forgetName] = useDraft("profile.new.name", "");

	// Chosen on the shared input screen; it waits here, staged, until the
	// profile is created, so it survives the popup closing.
	const pickedAvatar = usePickedFile(AVATAR_SLOT);
	const avatar = pickedAvatar.blob;
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [warning, setWarning] = useState("");

	const handleCreate = async () => {
		const trimmedName = name.trim();
		if (trimmedName === "" || trimmedName.length > LMAX_NAME_LENGTH) {
			return;
		}
		const problem = passwordProblem(password);
		if (problem) {
			setWarning(problem);
			return;
		}
		// The confirmation belongs to setting a password; it is hidden, and
		// may hold an old value, once the password is cleared.
		if (password !== "" && password !== confirmPassword) {
			setWarning("The passwords don't match.");
			return;
		}
		try {
			// Creating a profile also unlocks it.
			await send("profile.create", {
				name: trimmedName,
				password: password === "" ? null : password,
			});
			forgetName();
			if (avatar) {
				// The profile exists now. A refused photo is reported, and
				// can be set again from the profile page; staying on this
				// form would invite creating the profile twice.
				await attempt(
					() => sendAvatar(avatar),
					"The profile was created, but its photo couldn't be saved.",
				);
				await pickedAvatar.clear();
			}
			go(
				(await isFirstTimeUser()) ? "/getting-started" : "/home",
				"forward",
			);
		} catch (error) {
			await createToast(
				error instanceof Error
					? error.message
					: "Couldn't create this profile.",
				LTOAST_TYPE.ERROR,
			);
		}
	};

	// The page moves away and the upload screen comes in, as with Lock.
	const goToUpload = () => {
		go(pickRoute(AVATAR_REQUEST, AVATAR_SLOT, "/new-profile"), "outOf");
	};

	return (
		<motion.div
			className={`flex h-full w-full flex-col bg-white select-none`}
			{...pageMotion}
		>
			<LUIBasicNav
				navigateTo="/browse-profiles"
				passedTheme={LTHEME.LIGHT}
			/>
			<div
				className={`flex w-full grow flex-col items-center justify-start gap-y-5 overflow-y-hidden`}
			>
				<h1
					className={`mt-2 flex items-center justify-center text-2xl font-semibold tracking-tight text-black`}
				>
					New Profile
				</h1>
				<div
					className={`flex w-full grow flex-col items-center justify-start gap-y-5 overflow-y-auto px-6 pt-5 pb-1 ${LTHEME.LIGHT}-scrollbar`}
				>
					<div
						className={`flex h-max w-full items-center justify-center`}
					>
						<LUIAvatarInput
							avatar={avatar}
							onChoose={() => goToUpload()}
							onRemove={() => void pickedAvatar.clear()}
							theme={LTHEME.LIGHT}
						/>
					</div>
					<div className="flex h-12 w-full items-center justify-center">
						<LUIIconField
							id="little-new-profile-name"
							icon={IdentificationBadgeIcon}
							placeholder="Name"
							ariaLabel="Profile name"
							maxLength={LMAX_NAME_LENGTH}
							value={name}
							onChange={setName}
							onSubmit={() => {
								void handleCreate();
							}}
							passedTheme={LTHEME.LIGHT}
						/>
					</div>
					<div className="flex h-max w-full flex-col items-center justify-center gap-y-2">
						<LUIIconField
							id="little-new-profile-password"
							name="new-password"
							icon={PasswordIcon}
							placeholder="Password (optional)"
							ariaLabel="Password"
							type="password"
							autoComplete="new-password"
							value={password}
							onChange={(value) => {
								setPassword(value);
								setWarning("");
							}}
							onSubmit={() => {
								void handleCreate();
							}}
							passedTheme={LTHEME.LIGHT}
						/>
						{password !== "" ? (
							<LUIIconField
								id="little-new-profile-password-confirm"
								name="confirm-password"
								icon={PasswordIcon}
								placeholder="Confirm password"
								ariaLabel="Confirm password"
								type="password"
								autoComplete="new-password"
								value={confirmPassword}
								onChange={(value) => {
									setConfirmPassword(value);
									setWarning("");
								}}
								onSubmit={() => {
									void handleCreate();
								}}
								passedTheme={LTHEME.LIGHT}
							/>
						) : null}
						<LUINote
							warning={warning !== ""}
							passedTheme={LTHEME.LIGHT}
						>
							{warning !== ""
								? warning
								: password === ""
									? NO_PASSWORD_NOTE
									: "You'll need this password to unlock the profile. It can't be recovered."}
						</LUINote>
					</div>
					<div className="flex h-12 w-full items-center justify-center">
						<LUICUButton
							name="Create"
							onClick={handleCreate}
							passedTheme={LTHEME.LIGHT}
							disabled={name.trim() === ""}
						/>
					</div>
				</div>
			</div>
		</motion.div>
	);
};

export { Page as LUIProfileCreator };
