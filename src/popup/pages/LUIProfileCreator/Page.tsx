import { useRef, useState } from "react";
import {
	IdentificationBadgeIcon,
	InfoIcon,
	PasswordIcon,
} from "@phosphor-icons/react";
import { fakeWait } from "little-shared/utils/misc";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIAvatarInput } from "../../components/LUIAvatarInput/Component";
import { LUICUButton } from "../../components/LUICUButton/Component";
import { LUIIconField } from "../../components/LUIIconField/Component";
import { send } from "../../../utils/send";
import { sendAvatar } from "../../../utils/avatar";
import { isFirstTimeUser } from "../../../services/settings";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { NO_PASSWORD_NOTE, passwordProblem } from "../../passwords";
import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
import { LMAX_NAME_LENGTH } from "little-shared/constants";
import { createToast } from "../../../services/toasts";

const Page = () => {
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});

	const navigate = useNavigate();
	const [name, setName] = useState("");

	const [avatar, setAvatar] = useState<Blob | null>(null);
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [warning, setWarning] = useState("");

	const avatarInputRef = useRef<HTMLInputElement>(null);

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
		await fakeWait();
		try {
			// Creating a profile also unlocks it.
			await send("profile.create", {
				name: trimmedName,
				password: password === "" ? null : password,
			});
			if (avatar) {
				await sendAvatar(avatar);
			}
			navigate((await isFirstTimeUser()) ? "/getting-started" : "/home", {
				state: { entryTransition: entryTransitions.slideLeft },
			});
		} catch (error) {
			await createToast(
				error instanceof Error
					? error.message
					: "Couldn't create this profile.",
				LTOAST_TYPE.ERROR,
			);
		}
	};

	return (
		<motion.div
			className={`flex h-full w-full flex-col bg-white select-none`}
			{...entry}
			{...exit}
		>
			<LUIBasicNav
				navigateTo="/browse-profiles"
				passedTheme={LTHEME.LIGHT}
			/>
			<div
				className={`flex w-full grow flex-col items-center justify-start gap-y-5 overflow-y-hidden`}
			>
				<div
					className={`mt-5 flex items-center justify-center text-4xl font-semibold text-black`}
				>
					New Profile
				</div>
				<div
					className={`flex w-full grow flex-col items-center justify-start gap-y-5 overflow-y-auto px-12 pt-5 pb-1`}
				>
					<div
						className={`flex h-max w-full items-center justify-center`}
					>
						<LUIAvatarInput
							avatar={avatar}
							setAvatar={setAvatar}
							avatarInputRef={avatarInputRef}
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
								passedTheme={LTHEME.LIGHT}
							/>
						) : null}
						<div className="flex h-max w-72 gap-x-1 opacity-75">
							<LUIThemedIcon
								Icon={InfoIcon}
								weight="fill"
								className="h-5 w-5 shrink-0"
								passedTheme={LTHEME.LIGHT}
							/>
							<div className="text-sm text-black italic">
								{warning !== ""
									? warning
									: password === ""
										? NO_PASSWORD_NOTE
										: "You'll need this password to unlock the profile. It can't be recovered."}
							</div>
						</div>
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
