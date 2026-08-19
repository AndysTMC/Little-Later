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
import { useEffect, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { AnimatePresence, motion } from "framer-motion";
import { authenticateUser, deleteUser } from "../../../services/user";
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

	const [password, setPassword] = useState("");

	const userAvatar = useUserAvatar(userProfile.userId);
	const avatarUrl = useObjectUrl(userAvatar?.blob);

	const handleGo = async () => {
		setIsOperationInProgress(true);
		try {
			await fakeWait();
			try {
				const isAuthenticated = await authenticateUser(
					userProfile.userId,
					password === "" ? undefined : password,
				);
				if (!isAuthenticated && type === "Unlock") {
					setUnlockWarning("Incorrect password");
					return;
				}
			} catch (error) {
				await createToast(
					error instanceof Error
						? error.message
						: "Couldn't verify this profile.",
					LTOAST_TYPE.ERROR,
				);
				return;
			}
			await handleFunction(password === "" ? undefined : password);
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
			return;
		}
		setIsOperationInProgress(true);
		try {
			await deleteUser(userProfile.userId);
			navigate("/browse-profiles");
		} catch (error) {
			await createToast(
				error instanceof Error
					? error.message
					: "Couldn't delete this profile.",
				LTOAST_TYPE.ERROR,
			);
		} finally {
			setIsOperationInProgress(false);
		}
	};

	const [lockInfo, setLockInfo] = useState("Continue with passwordless");

	const [unlockWarning, setUnlockWarning] = useState("");

	useEffect(() => {
		if (type !== "Lock") {
			return;
		}
		if (password === "") {
			setLockInfo("Continue with passwordless");
			return;
		}
		setLockInfo("Continue with new password");
		let cancelled = false;
		const timeoutId = window.setTimeout(async () => {
			try {
				const isOldPassword = await authenticateUser(
					userProfile.userId,
					password,
				);
				if (!cancelled) {
					setLockInfo(
						isOldPassword
							? "Continue with old password"
							: "Continue with new password",
					);
				}
			} catch {
				if (!cancelled) {
					setLockInfo("Continue with new password");
				}
			}
		}, 350);
		return () => {
			cancelled = true;
			window.clearTimeout(timeoutId);
		};
	}, [password, type, userProfile.userId]);

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
									setIsConfirmingDelete(false);
								}}
								onSubmit={() => {
									void handleGo();
								}}
							/>
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
							{type === "Unlock" &&
							!isOperationInProgress &&
							unlockWarning !== "" ? (
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
										{unlockWarning}
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
								Go
							</button>
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
