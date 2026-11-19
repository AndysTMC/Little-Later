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
import { useMoveNavigate } from "../../hooks/usePageMove";
import { twMerge } from "tailwind-merge";
import { useUserAvatar } from "../../hooks/useUserAvatar";
import { useObjectUrl } from "../../hooks/useObjectUrl";

const DELETE_CONFIRM_DELAY_MS = 800;

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
	const go = useMoveNavigate();

	const [isOperationInProgress, setIsOperationInProgress] = useState(false);
	// null means no delete is being confirmed.
	const [deletePassword, setDeletePassword] = useState<string | null>(null);
	const isConfirmingDelete = deletePassword !== null;
	const [deleteArmedAt, setDeleteArmedAt] = useState(0);

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
			setDeleteArmedAt(Date.now());
			setWarning(
				userProfile.hasPassword
					? "Deleting erases everything in this profile. Enter its password to confirm"
					: "Deleting erases everything in this profile. Press again to confirm",
			);
			return;
		}
		if (userProfile.hasPassword && deletePassword === "") {
			setWarning("Enter this profile's password to delete it");
			return;
		}
		// Confirm appears where Delete was, so without a password the second
		// half of a double click must not count as the confirmation. A
		// protected profile asks for its password first.
		if (
			!userProfile.hasPassword &&
			Date.now() - deleteArmedAt < DELETE_CONFIRM_DELAY_MS
		) {
			return;
		}
		setIsOperationInProgress(true);
		try {
			await send("profile.delete", {
				profileId: userProfile.id,
				password: userProfile.hasPassword ? deletePassword : null,
			});
			// Out of the deleted profile, like locking.
			go("/browse-profiles", "outOf");
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

	const cancelDelete = () => {
		setDeletePassword(null);
		setWarning("");
	};

	const lockInfo = userProfile.hasPassword
		? "Locking forgets the key; you'll need the password to open this profile again"
		: "This profile has no password, so it is not encrypted at rest";

	const isDark = theme === LTHEME.DARK;
	const text = isDark ? "text-white" : "text-black";
	const primary = isDark
		? "bg-white text-black hover:bg-neutral-200"
		: "bg-black text-white hover:bg-neutral-800";
	// Deleting is the less common way out of this screen, so it is quieter.
	const secondary = isDark
		? "border border-neutral-700 text-white hover:bg-neutral-900"
		: "border border-neutral-300 text-black hover:bg-neutral-100";
	const note = (Icon: typeof InfoIcon, message: string, alert = false) => (
		<div
			role={alert ? "alert" : undefined}
			className="flex h-max w-72 shrink-0 gap-x-1 opacity-75"
		>
			<LUIThemedIcon
				Icon={Icon}
				weight="fill"
				color={isDark ? "white" : "black"}
				className="h-5 w-5 shrink-0"
			/>
			<div className={`text-sm italic ${text}`}>{message}</div>
		</div>
	);

	return (
		<div
			className={twMerge(
				`flex min-h-0 w-full grow flex-col items-center justify-start gap-y-5`,
				className,
			)}
		>
			<h1
				className={`flex shrink-0 items-center justify-center ${text} mt-5 text-4xl font-semibold`}
			>
				{type}
			</h1>
			{/* Scrolls rather than squeezing its parts when they do not fit. */}
			<form
				className="flex min-h-0 w-full grow flex-col items-center gap-y-5 overflow-y-auto px-12 pt-5 pb-4"
				onSubmit={handleSubmit}
			>
				<div
					className={`flex h-max w-full shrink-0 items-center justify-center ${isOperationInProgress ? "mt-20 animate-bounce" : ""} pt-5 transition-all delay-300 duration-300`}
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
					{isOperationInProgress ? null : (
						<motion.div
							// One view at a time, swapped at once: opening or
							// locking, or deleting, each with its own single
							// password field.
							className="flex w-full shrink-0 flex-col items-center gap-y-3"
							initial={{ opacity: 0 }}
							animate={{
								opacity: 1,
								transition: { duration: 0.2 },
							}}
							exit={{ opacity: 0, transition: { duration: 0.2 } }}
						>
							{isConfirmingDelete ? (
								<>
									{userProfile.hasPassword ? (
										<LUIIconField
											id="little-auth-delete-password"
											name="delete-password"
											icon={PasswordIcon}
											placeholder="Password"
											ariaLabel="Password to delete this profile"
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
									{warning !== ""
										? note(WarningCircleIcon, warning, true)
										: null}
									{/* Confirm sits where Delete was, so the second
									    half of a double click lands on it and the
									    confirmation guard ignores it. */}
									<button
										type="button"
										className={`flex h-12 w-72 shrink-0 cursor-pointer items-center justify-center rounded-lg ${secondary}`}
										onClick={cancelDelete}
									>
										Cancel
									</button>
									<button
										type="button"
										className="flex h-12 w-72 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700"
										onClick={handleDelete}
									>
										Confirm delete
									</button>
								</>
							) : (
								<>
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
											}}
											onSubmit={() => {
												void handleGo();
											}}
										/>
									) : null}
									{type === "Lock"
										? note(InfoIcon, lockInfo)
										: null}
									{warning !== ""
										? note(WarningCircleIcon, warning, true)
										: null}
									<button
										type="button"
										className={`flex h-12 w-72 shrink-0 cursor-pointer items-center justify-center rounded-lg ${primary}`}
										onClick={handleGo}
									>
										{type}
									</button>
									<button
										type="button"
										className={`flex h-12 w-72 shrink-0 cursor-pointer items-center justify-center rounded-lg ${secondary}`}
										onClick={handleDelete}
									>
										Delete
									</button>
								</>
							)}
						</motion.div>
					)}
				</AnimatePresence>
			</form>
		</div>
	);
};

export { Component as LUIAuthGate };
