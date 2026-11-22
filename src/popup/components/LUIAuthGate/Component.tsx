import type { UserProfile } from "../../hooks/useUserProfiles";
import {
	InfoIcon,
	KeyIcon,
	PasswordIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { LUIIconField } from "../LUIIconField/Component";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { send } from "../../../utils/send";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { LUICUButton } from "../LUICUButton/Component";
import { LUIIdentityPage } from "../LUIIdentityPage/Component";
import { LUINote } from "../LUINote/Component";
import { proveFactor } from "../../webauthn";
import { inToolbarPopup, openCeremonyWindow } from "../../ceremonyWindow";

// What comes with the password of a profile with two-factor unlock
// (decision 0015), as the unlock command takes it.
export type UnlockFactor =
	| { kind: "authenticator"; credentialId: string; secret: string }
	| { kind: "recovery"; code: string };

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
	handleFunction: (password?: string, factor?: UnlockFactor) => Promise<void>;
}) => {
	const go = useMoveNavigate();

	const [isOperationInProgress, setIsOperationInProgress] = useState(false);
	const busyRef = useRef(false);
	// null means no delete is being confirmed.
	const [deletePassword, setDeletePassword] = useState<string | null>(null);
	const isConfirmingDelete = deletePassword !== null;
	const [deleteArmedAt, setDeleteArmedAt] = useState(0);

	const [password, setPassword] = useState("");
	const [warning, setWarning] = useState("");

	// Locking only forgets the key (0010): the password is set, changed or
	// removed on the profile page, never at lock time.
	const needsPassword = type === "Unlock" && userProfile.hasPassword;
	const authenticators =
		type === "Unlock" ? userProfile.authenticators : null;
	// The recovery code instead of the key, for a lost or absent key.
	const [useRecovery, setUseRecovery] = useState(false);
	const [recoveryCode, setRecoveryCode] = useState("");
	// The key prompt would close the toolbar popup, so there the unlock
	// moves to a window of its own (ceremonyWindow.ts).
	const [inPopup] = useState(inToolbarPopup);
	const continuesElsewhere =
		authenticators !== null && !useRecovery && inPopup;

	const handleGo = async () => {
		if (busyRef.current) return;
		if (continuesElsewhere) {
			await openCeremonyWindow(`/unlock/${userProfile.id}`);
			return;
		}
		if (needsPassword && password === "") {
			setWarning("Enter this profile's password");
			return;
		}
		if (
			authenticators !== null &&
			useRecovery &&
			recoveryCode.trim() === ""
		) {
			setWarning("Enter your recovery code");
			return;
		}
		busyRef.current = true;
		setIsOperationInProgress(true);
		try {
			const factor: UnlockFactor | undefined =
				authenticators === null
					? undefined
					: useRecovery
						? { kind: "recovery", code: recoveryCode }
						: {
								kind: "authenticator",
								...(await proveFactor(authenticators)),
							};
			await handleFunction(needsPassword ? password : undefined, factor);
		} catch (error) {
			setWarning(
				error instanceof Error
					? error.message
					: "Couldn't open this profile.",
			);
		} finally {
			busyRef.current = false;
			setIsOperationInProgress(false);
		}
	};

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		await handleGo();
	};

	const handleDelete = async () => {
		if (busyRef.current) return;
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
		busyRef.current = true;
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
			busyRef.current = false;
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

	const note = (Icon: typeof InfoIcon, message: string, alert = false) => (
		<LUINote icon={Icon} warning={alert}>
			{message}
		</LUINote>
	);

	return (
		<LUIIdentityPage
			title={type}
			profile={userProfile}
			busy={isOperationInProgress}
			onSubmit={handleSubmit}
			className={className}
		>
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
								<LUICUButton
									variant="secondary"
									name="Cancel"
									onClick={cancelDelete}
								/>
								<LUICUButton
									variant="danger"
									name="Confirm delete"
									onClick={handleDelete}
								/>
							</>
						) : (
							<>
								{needsPassword && !continuesElsewhere ? (
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
								{authenticators !== null && useRecovery ? (
									<LUIIconField
										id="little-auth-recovery"
										name="recovery-code"
										icon={KeyIcon}
										placeholder="Recovery code"
										ariaLabel="Recovery code"
										type="text"
										autoComplete="off"
										value={recoveryCode}
										onChange={(next) => {
											setRecoveryCode(next);
											setWarning("");
										}}
										onSubmit={() => {
											void handleGo();
										}}
									/>
								) : null}
								{continuesElsewhere
									? note(
											KeyIcon,
											"This profile also needs its security key or passkey. Unlocking continues in a small window.",
										)
									: null}
								{type === "Lock"
									? note(InfoIcon, lockInfo)
									: null}
								{warning !== ""
									? note(WarningCircleIcon, warning, true)
									: null}
								<LUICUButton
									name={
										continuesElsewhere
											? "Use security key"
											: type
									}
									onClick={handleGo}
								/>
								{authenticators !== null ? (
									<LUICUButton
										variant="secondary"
										name={
											useRecovery
												? "Use security key"
												: "Use recovery code"
										}
										onClick={() => {
											setUseRecovery(!useRecovery);
											setWarning("");
										}}
									/>
								) : null}
								<LUICUButton
									variant="secondary"
									name="Delete"
									onClick={handleDelete}
								/>
							</>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</LUIIdentityPage>
	);
};

export { Component as LUIAuthGate };
