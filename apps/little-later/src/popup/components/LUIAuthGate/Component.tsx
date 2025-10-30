import { LUserProfile } from "little-shared/types";
import { LTHEME } from "little-shared/enums";
import {
	InfoIcon,
	PasswordIcon,
	UserCircleIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { useEffect, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { AnimatePresence, motion } from "framer-motion";
import { authenticateUser, deleteUser } from "../../../services/user";
import { fakeWait } from "little-shared/utils/misc";
import { useNavigate } from "react-router";
import { twMerge } from "tailwind-merge";
import { useUserAvatar } from "../../hooks/useUserAvatar";

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

	const [password, setPassword] = useState("");

	const userAvatar = useUserAvatar(userProfile.userId);

	const handleGo = async () => {
		setIsOperationInProgress(true);
		await fakeWait();
		const isAuthenticated = await authenticateUser(
			userProfile.userId,
			password === "" ? undefined : password,
		);
		if (!isAuthenticated && type === "Unlock") {
			setIsOperationInProgress(false);
			setUnlockWarning("Incorrect password");
			return;
		}
		await handleFunction(password === "" ? undefined : password);
		setIsOperationInProgress(false);
	};

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		await handleGo();
	};

	const handleDelete = async () => {
		await deleteUser(userProfile.userId);
		navigate("/browse-profiles");
	};

	const [lockInfo, setLockInfo] = useState("Continue with passwordless");

	const [unlockWarning, setUnlockWarning] = useState("");

	useEffect(() => {
		const handleLockInfo = async () => {
			if (type === "Lock") {
				if (password === "") {
					setLockInfo("Continue with passwordless");
				} else {
					const isOldPassword = await authenticateUser(
						userProfile.userId,
						password,
					);
					if (isOldPassword) {
						setLockInfo("Continue with old password");
					} else {
						setLockInfo("Continue with new password");
					}
				}
			}
		};
		handleLockInfo();
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
					{userAvatar?.blob ? (
						<img
							src={URL.createObjectURL(userAvatar.blob)}
							alt="avatar"
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
							<div
								className={`flex h-12 w-72 items-center rounded-lg border border-solid ${
									theme === LTHEME.DARK
										? "border-neutral-700 bg-neutral-900"
										: "border-neutral-300 bg-neutral-100"
								} `}
							>
								<div
									className={`flex h-12 w-16 items-center justify-center`}
								>
									<LUIThemedIcon
										Icon={PasswordIcon}
										weight="fill"
										color={
											theme === LTHEME.DARK
												? "white"
												: "black"
										}
										className="h-7 w-7"
									/>
								</div>
								<div className={`h-full grow`}>
									<input
										type="password"
										placeholder="Password"
										name="password"
										autoComplete="on"
										value={password}
										onChange={(event) =>
											setPassword(event.target.value)
										}
										className={`h-full w-full text-xl font-thin ${
											theme === LTHEME.DARK
												? "text-white"
												: "text-black"
										} border-none bg-transparent outline-none`}
									/>
								</div>
							</div>
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
									theme === LTHEME.DARK
										? "border-black bg-white text-black hover:bg-neutral-100"
										: "border-white bg-black text-white hover:bg-neutral-900"
								} flex cursor-pointer items-center justify-center rounded-lg`}
								onClick={handleDelete}
								type="button"
							>
								Delete
							</button>
						</motion.div>
					) : null}
				</AnimatePresence>
			</form>
		</div>
	);
};

export { Component as LUIAuthGate };
