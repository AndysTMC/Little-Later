import type { UserProfile } from "../../hooks/useUserProfiles";
import { LTHEME } from "little-shared/enums";
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
import { send } from "../../../utils/send";
import { fakeWait } from "little-shared/utils/misc";
import { useNavigate } from "react-router";
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
	userProfile: UserProfile;
	handleFunction: (password?: string) => Promise<void>;
}) => {
	const { theme } = useTheme();
	const navigate = useNavigate();

	const [isOperationInProgress, setIsOperationInProgress] = useState(false);
	// null means no delete is being confirmed.
	const [deletePassword, setDeletePassword] = useState<string | null>(null);
	const isConfirmingDelete = deletePassword !== null;

	const [password, setPassword] = useState("");
	const [warning, setWarning] = useState("");

	const userAvatar = useUserAvatar(userProfile.id);
	const avatarUrl = useObjectUrl(userAvatar);

	// Locking only forgets the key (0010): the password is set, changed or
	// removed on the profile page, never at lock time.
	const needsPassword = type === "Unlock" && userProfile.hasPassword;

	const handleGo = async () => {
		if (needsPassword && password === "") {
			setWarning("Enter this profile's password");
			return;
		}
		setIsOperationInProgress(true);
		try {
			await fakeWait();
			await handleFunction(needsPassword ? password : undefined);
		} catch (error) {
			setWarning(
				error instanceof Error
					? error.message
					: "Couldn't open this profile.",
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
		if (deletePassword === null) {
			setDeletePassword("");
			setWarning(
				userProfile.hasPassword
					? "Deleting erases everything in this profile. Enter its password below, then confirm"
					: "Deleting erases everything in this profile. Press again to confirm",
			);
			return;
		}
		setIsOperationInProgress(true);
		try {
			await send("profile.delete", {
				profileId: userProfile.id,
				password: userProfile.hasPassword ? deletePassword : null,
			});
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

	const lockInfo = userProfile.hasPassword
		? "Locking forgets the key; you'll need the password to open this profile again"
		: "This profile has no password, so it is not encrypted at rest";

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
							{needsPassword ? (
								<LUIIconField
									id="little-auth-password"
									name="password"
									icon={PasswordIcon}
									placeholder="Password"
									ariaLabel="Password"
									type="password"
									autoComplete="current-password"
									value={password}
									onChange={(nextPassword) => {
										setPassword(nextPassword);
										setWarning("");
										setDeletePassword(null);
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
								{type}
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
							{deletePassword !== null &&
							userProfile.hasPassword ? (
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
