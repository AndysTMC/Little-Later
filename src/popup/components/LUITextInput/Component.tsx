import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useState } from "react";
import { Validation } from "../../../types";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	name,
	passedValue,
	onChange,
	lengthLimit = 16,
	validate = () => ({ success: true, error: "" }),
	disabled = false,
	disableLengthCounter = false,
	inputType = "text",
}: {
	className?: string;
	name: string;
	passedValue: string;
	onChange: (value: string) => void;
	lengthLimit: number;
	validate: (value: string) => Validation;
	disabled?: boolean;
	disableLengthCounter?: boolean;
	inputType?: "text" | "password" | "url";
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const [error, setError] = useState<string | null>(null);
	const inputId = `little-input-${name.replace(/\s+/g, "-").toLowerCase()}`;

	const handleOnChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value;
		const validation = validate(value);
		if (!validation.success) {
			setError(validation.error);
		} else {
			setError(null);
		}
		onChange(value);
	};

	return (
		<div
			className={twMerge(
				`my-1.5 flex h-max w-full flex-col gap-y-1`,
				className,
			)}
		>
			<div className="flex items-center justify-between px-0.5">
				<label
					htmlFor={inputId}
					className={`text-xs font-medium ${
						isDark ? "text-neutral-400" : "text-neutral-600"
					}`}
				>
					{name}
				</label>
				{!disableLengthCounter ? (
					<span
						className={`text-[11px] tabular-nums ${
							isDark ? "text-neutral-500" : "text-neutral-400"
						}`}
					>
						{passedValue.length}/{lengthLimit}
					</span>
				) : null}
			</div>
			<input
				id={inputId}
				type={inputType}
				autoComplete={inputType === "password" ? "off" : undefined}
				aria-invalid={error !== null}
				maxLength={lengthLimit}
				className={`h-10 w-full appearance-none rounded-xl border px-3.5 text-sm transition-colors duration-150 ${
					error
						? "border-red-500"
						: isDark
							? "border-neutral-700 focus:border-neutral-400"
							: "border-neutral-300 focus:border-neutral-600"
				} ${
					isDark
						? "bg-neutral-900 text-neutral-100 placeholder:text-neutral-500"
						: "bg-white text-neutral-900 placeholder:text-neutral-400"
				} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-text"}`}
				aria-label={name}
				placeholder={name}
				value={passedValue}
				onChange={handleOnChange}
				disabled={disabled}
			/>
			{error ? (
				<p role="alert" className="px-0.5 text-xs text-red-500">
					{error}
				</p>
			) : null}
		</div>
	);
};

export { Component as LUITextInputT1 };
