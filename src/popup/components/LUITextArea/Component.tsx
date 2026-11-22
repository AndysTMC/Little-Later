import { LTHEME } from "little-shared/enums";
import { useEffect, useId, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { Validation } from "../../../types";
import { useTheme } from "../../hooks/useTheme";

const Component = ({
	className,
	name,
	passedValue,
	onChange,
	lengthLimit = 128,
	validate = () => ({ success: true, error: "" }),
	showLabel = true,
}: {
	className?: string;
	name: string;
	passedValue: string;
	onChange: (value: string) => void;
	lengthLimit: number;
	validate: (value: string) => Validation;
	showLabel?: boolean;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const id = useId();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [error, setError] = useState<string | null>(null);

	const adjustHeight = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
		}
	};

	const handleOnChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
		const value = event.target.value;
		const validation = validate(value);
		if (!validation.success) {
			setError(validation.error);
		} else {
			setError(null);
		}
		onChange(value);
	};

	useEffect(() => {
		adjustHeight();
	}, [passedValue]);

	return (
		<div
			className={twMerge(
				`my-1.5 flex h-max w-full flex-col gap-y-1`,
				className,
			)}
		>
			<div className="flex items-center justify-between px-0.5">
				{showLabel ? (
					<label
						htmlFor={id}
						className={`text-xs font-medium ${
							isDark ? "text-neutral-400" : "text-neutral-600"
						}`}
					>
						{name}
					</label>
				) : (
					<span />
				)}
				<span
					className={`text-[11px] tabular-nums ${
						isDark ? "text-neutral-500" : "text-neutral-400"
					}`}
				>
					{passedValue.length}/{lengthLimit}
				</span>
			</div>

			<textarea
				id={id}
				ref={textareaRef}
				className={`min-h-14 w-full resize-none overflow-hidden rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed transition-colors duration-150 ${
					error
						? "border-red-500"
						: isDark
							? "border-neutral-700 focus:border-neutral-400"
							: "border-neutral-300 focus:border-neutral-600"
				} ${
					isDark
						? "bg-neutral-900 text-neutral-100 placeholder:text-neutral-500"
						: "bg-white text-neutral-900 placeholder:text-neutral-400"
				}`}
				aria-label={name}
				aria-invalid={error !== null}
				placeholder={name}
				value={passedValue}
				maxLength={lengthLimit}
				onChange={handleOnChange}
			/>
			{error ? (
				<p role="alert" className="px-0.5 text-xs text-red-500">
					{error}
				</p>
			) : null}
		</div>
	);
};

export { Component as LUITextArea };
