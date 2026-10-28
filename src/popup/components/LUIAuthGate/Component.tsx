import { LUserProfile } from "little-shared/types";
import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
import {
	InfoIcon,
	PasswordIcon,
	UserCircleIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LUIIconField } from "../LUIIconField/Component";
import { useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { AnimatePresence, motion } from "framer-motion";
import {
	authenticateUser,
	checkLockPassword,
	deleteUser,
} from "../../../services/user";
import { fakeWait } from "little-shared/utils/misc";
import { useNavigate } from "react-router";
import { createToast } from "../../../services/toasts";
import { twMerge } from "tailwind-merge";
import { useUserAvatar } from "../../hooks/useUserAvatar";
import { useObjectUrl } from "../../hooks/useObjectUrl";

const Component = ({
	className,
	type,
	userProfile,
	handleFunction,
}: {
	className?: string;
	type: "Unlock" | "Lock";
	userProfile: LUserProfile;
	handleFunction: (password?: string) => Promise<void>;
}) => {
	const { theme } = useTheme();
	const navigate = useNavigate();

	const [isOperationInProgress, setIsOperationInProgress] = useState(false);
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
	// On the lock screen the main field means "new password", so deleting
	// asks for the current password in a field of its own.
	const [deletePassword, setDeletePassword] = useState("");

	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	// Lock re-encrypts the vault with the typed password, so a new password is
	// typed twice and removing the password takes an explicit second press.
	const [lockStep, setLockStep] = useState<
		"enter" | "confirm-new" | "confirm-remove"
	>("enter");
	const [warning, setWarning] = useState("");

	const userAvatar = useUserAvatar(userProfile.userId);
	const avatarUrl = useObjectUrl(userAvatar?.blob);

	const lockWith = async (nextPassword?: string) => {
		await handleFunction(nextPassword);
	};

	const handleLock = async () => {
		if (lockStep === "confirm-new") {
			if (confirmPassword !== password) {
				setWarning("The passwords don't match");
				return;
			}
			await lockWith(password);
			return;
		}
		if (lockStep === "confirm-remove") {
			await lockWith(undefined);
			return;
		}
		const check = await checkLockPassword(userProfile.userId, password);
		if (check.kind === "invalid") {
			setWarning(check.problem);
		} else if (check.kind === "current") {
			await lockWith(password === "" ? undefined : password);
		} else if (check.kind === "new") {
			setLockStep("confirm-new");
			setWarning("Type the new password again to confirm it");
		} else {
			setLockStep("confirm-remove");
			setWarning(
				"This removes the password: anyone using this browser can open the profile. Press the button again to confirm.",
			);
		}
	};

	const handleUnlock = async () => {
		const isAuthenticated = await authenticateUser(
			userProfile.userId,
			password === "" ? undefined : password,
		);
		if (!isAuthenticated) {
			setWarning("Incorrect password");
			return;
		}
		await handleFunction(password === "" ? undefined : password);
	};

	const handleGo = async () => {
		setIsOperationInProgress(true);
		try {
			await fakeWait();
			if (type === "Lock") {
				await handleLock();
			} else {
				await handleUnlock();
			}
		} catch (error) {
			await createToast(
				error instanceof Error
					? error.message
					: "Couldn't verify this profile.",
				LTOAST_TYPE.ERROR,
			);
		} finally {
			setIsOperationInProgress(false);
		}
	};

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		await handleGo();
	};

	const handleDelete = async () => {
		if (!isConfirmingDelete) {
			setIsConfirmingDelete(true);
			setWarning(
				"Enter this profile's current password (if it has one) below, then confirm",
			);
			return;
		}
		setIsOperationInProgress(true);
		try {
			await deleteUser(
				userProfile.userId,
				deletePassword === "" ? undefined : deletePassword,
			);
			navigate("/browse-profiles");
		} catch (error) {
			setWarning(
				error instanceof Error
					? error.message
					: "Couldn't delete this profile.",
			);
		} finally {
			setIsOperationInProgress(false);
		}
	};

	const lockInfo =
		lockStep === "confirm-new"
			? "Locking with a new password"
			: lockStep === "confirm-remove"
				? "Locking without a password"
				: "Enter the current password, a new one, or leave empty for none";

	return (
		<div
			className={twMerge(
				`flex w-full grow flex-col items-center justify-start gap-y-5 overflow-y-hidden`,
				className,
			)}
		>
			<div
				className={`flex items-center justify-center ${theme === LTHEME.DARK ? "text-white" : "text-black"} mt-5 text-4xl font-semibold`}
			>
				{type}
			</div>
			<form
				className={`flex w-full grow flex-col items-center gap-y-5 overflow-y-hidden px-12 pt-5 pb-1 transition-all delay-600 duration-300`}
				onSubmit={handleSubmit}
			>
				<div
					className={`flex h-max w-full items-center justify-center ${isOperationInProgress ? "mt-20 animate-bounce" : ""} pt-5 transition-all delay-300 duration-300`}
				>
					{avatarUrl ? (
						<img
							src={avatarUrl}
							alt={`${userProfile.name} avatar`}
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
				<AnimatePresence>
					{!isOperationInProgress ? (
						<motion.div
							className={`flex h-max w-full flex-col items-center justify-center gap-y-1`}
							initial={{ opacity: 0 }}
							animate={{
								opacity: 1,
								transition: { duration: 0.3, delay: 0.3 },
							}}
							exit={{
								opacity: 0,
								transition: { duration: 0.3, delay: 0.3 },
							}}
						>
							<LUIIconField
								id="little-auth-password"
								name="password"
								icon={PasswordIcon}
								placeholder="Password"
								ariaLabel="Password"
								type="password"
								autoComplete={
									type === "Unlock"
										? "current-password"
										: "new-password"
								}
								value={password}
								onChange={(nextPassword) => {
									setPassword(nextPassword);
									setConfirmPassword("");
									setLockStep("enter");
									setWarning("");
									setIsConfirmingDelete(false);
									setDeletePassword("");
								}}
								onSubmit={() => {
									void handleGo();
								}}
							/>
							{type === "Lock" && lockStep === "confirm-new" ? (
								<LUIIconField
									id="little-auth-password-confirm"
									name="confirm-password"
									icon={PasswordIcon}
									placeholder="Confirm new password"
									ariaLabel="Confirm new password"
									type="password"
									autoComplete="new-password"
									value={confirmPassword}
									onChange={(nextConfirmation) => {
										setConfirmPassword(nextConfirmation);
										setWarning("");
									}}
									onSubmit={() => {
										void handleGo();
									}}
								/>
							) : null}
							{type === "Lock" && !isOperationInProgress ? (
								<div
									className={`flex h-max w-72 gap-x-1 opacity-75`}
								>
									<LUIThemedIcon
										Icon={InfoIcon}
										weight="fill"
										color={
											theme === LTHEME.DARK
												? "white"
												: "black"
										}
										className="h-5 w-5"
									/>
									<div
										className={`text-sm italic ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
									>
										{lockInfo}
									</div>
								</div>
							) : null}
							{!isOperationInProgress && warning !== "" ? (
								<div
									className={`flex h-max w-72 gap-x-1 opacity-75`}
								>
									<LUIThemedIcon
										Icon={WarningCircleIcon}
										weight="fill"
										color={
											theme === LTHEME.DARK
												? "white"
												: "black"
										}
										className="h-5 w-5"
									/>
									<div
										className={`text-sm italic ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
									>
										{warning}
									</div>
								</div>
							) : null}
						</motion.div>
					) : null}
				</AnimatePresence>
				<AnimatePresence>
					{!isOperationInProgress ? (
						<motion.div
							className={`flex h-12 w-full items-center justify-center`}
							initial={{ opacity: 0 }}
							animate={{
								opacity: 1,
								transition: { duration: 0.3, delay: 0.3 },
							}}
							exit={{
								opacity: 0,
								transition: { duration: 0.3, delay: 0.3 },
							}}
						>
							<button
								className={`h-12 w-72 ${
									theme === LTHEME.DARK
										? "border-black bg-white text-black hover:bg-neutral-100"
										: "border-white bg-black text-white hover:bg-neutral-900"
								} flex cursor-pointer items-center justify-center rounded-lg`}
								onClick={handleGo}
								type="button"
							>
								{lockStep === "confirm-remove"
									? "Remove password and lock"
									: "Go"}
							</button>
						</motion.div>
					) : null}
				</AnimatePresence>
				<AnimatePresence>
					{!isOperationInProgress ? (
						<motion.div
							className={`flex h-max min-h-12 w-full flex-col items-center justify-center gap-y-2`}
							initial={{ opacity: 0 }}
							animate={{
								opacity: 1,
								transition: { duration: 0.3, delay: 0.3 },
							}}
							exit={{
								opacity: 0,
								transition: { duration: 0.3, delay: 0.3 },
							}}
						>
							{isConfirmingDelete ? (
								<LUIIconField
									id="little-auth-delete-password"
									name="delete-password"
									icon={PasswordIcon}
									placeholder="Current password"
									ariaLabel="Current password to delete this profile"
									type="password"
									autoComplete="current-password"
									value={deletePassword}
									onChange={(nextPassword) => {
										setDeletePassword(nextPassword);
										setWarning("");
									}}
									onSubmit={() => {
										void handleDelete();
									}}
								/>
							) : null}
							<button
								className={`h-12 w-72 ${
									isConfirmingDelete
										? "bg-red-600 text-white hover:bg-red-700"
										: theme === LTHEME.DARK
											? "border-black bg-white text-black hover:bg-neutral-100"
											: "border-white bg-black text-white hover:bg-neutral-900"
								} flex cursor-pointer items-center justify-center rounded-lg`}
								onClick={handleDelete}
								type="button"
							>
								{isConfirmingDelete
									? "Confirm delete"
									: "Delete"}
							</button>
						</motion.div>
					) : null}
				</AnimatePresence>
			</form>
		</div>
	);
};

export { Component as LUIAuthGate };
