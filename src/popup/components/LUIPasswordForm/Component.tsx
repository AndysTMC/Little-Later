import { InfoIcon, PasswordIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { LUICUButton } from "../LUICUButton/Component";
import { LUIIconField } from "../LUIIconField/Component";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { NO_PASSWORD_NOTE, passwordProblem } from "../../passwords";

const Component = ({
	hasPassword,
	onSubmit,
	passedTheme,
}: {
	hasPassword: boolean;
	// Throws to show its message.
	onSubmit: (
		currentPassword: string | null,
		newPassword: string | null,
	) => Promise<void>;
	passedTheme?: LTHEME;
}) => {
	const { theme: contextTheme } = useTheme();
	const theme = passedTheme ?? contextTheme;
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [confirmingRemove, setConfirmingRemove] = useState(false);
	const [message, setMessage] = useState("");

	const removing = hasPassword && next === "";
	const action = removing
		? confirmingRemove
			? "Remove password"
			: "Remove password…"
		: hasPassword
			? "Change password"
			: "Set password";

	const reset = () => {
		setCurrent("");
		setNext("");
		setConfirm("");
		setConfirmingRemove(false);
	};

	const handleSubmit = async () => {
		setMessage("");
		if (!hasPassword && next === "") {
			setMessage("Type a password first.");
			return;
		}
		if (removing && !confirmingRemove) {
			setConfirmingRemove(true);
			setMessage(`${NO_PASSWORD_NOTE} Press again to confirm.`);
			return;
		}
		const problem = passwordProblem(next);
		if (problem) {
			setMessage(problem);
			return;
		}
		if (!removing && next !== confirm) {
			setMessage("The new passwords don't match.");
			return;
		}
		try {
			await onSubmit(
				hasPassword ? current : null,
				removing ? null : next,
			);
			reset();
			setMessage(
				removing
					? "Password removed."
					: hasPassword
						? "Password changed."
						: "Password set.",
			);
		} catch (error) {
			setMessage(
				error instanceof Error
					? error.message
					: "Couldn't change the password.",
			);
		}
	};

	return (
		<form
			className="flex w-full flex-col items-center gap-y-2"
			onSubmit={(event) => {
				event.preventDefault();
				void handleSubmit();
			}}
		>
			{hasPassword ? (
				<LUIIconField
					id="little-password-current"
					name="current-password"
					icon={PasswordIcon}
					placeholder="Current password"
					ariaLabel="Current password"
					type="password"
					autoComplete="current-password"
					value={current}
					onChange={(value) => {
						setCurrent(value);
						setMessage("");
					}}
					passedTheme={theme}
				/>
			) : null}
			<LUIIconField
				id="little-password-new"
				name="new-password"
				icon={PasswordIcon}
				placeholder={
					hasPassword ? "New password (empty removes it)" : "Password"
				}
				ariaLabel="New password"
				type="password"
				autoComplete="new-password"
				value={next}
				onChange={(value) => {
					setNext(value);
					setConfirmingRemove(false);
					setMessage("");
				}}
				passedTheme={theme}
			/>
			{next !== "" ? (
				<LUIIconField
					id="little-password-confirm"
					name="confirm-password"
					icon={PasswordIcon}
					placeholder="Confirm new password"
					ariaLabel="Confirm new password"
					type="password"
					autoComplete="new-password"
					value={confirm}
					onChange={(value) => {
						setConfirm(value);
						setMessage("");
					}}
					passedTheme={theme}
				/>
			) : null}
			{message !== "" ? (
				<div
					className="flex h-max w-72 gap-x-1 opacity-75"
					role="status"
				>
					<LUIThemedIcon
						Icon={InfoIcon}
						weight="fill"
						className="h-5 w-5 shrink-0"
						passedTheme={theme}
					/>
					<div
						className={`text-sm italic ${theme === LTHEME.DARK ? "text-white" : "text-black"}`}
					>
						{message}
					</div>
				</div>
			) : null}
			<LUICUButton
				name={action}
				onClick={handleSubmit}
				passedTheme={theme}
				disabled={!hasPassword && next === ""}
			/>
		</form>
	);
};

export { Component as LUIPasswordForm };
