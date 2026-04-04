import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Validation } from "../../../types";
import { twMerge } from "tailwind-merge";
import { LUILabel } from "../LUILabel/Component";

const Component = ({
	className,
	name,
	passedValue,
	onChange,
	lengthLimit = 16,
	validate = () => ({ success: true, error: "" }),
	disabled = false,
	disableLengthCounter = false,
}: {
	className?: string;
	name: string;
	passedValue: string;
	onChange: (value: string) => void;
	lengthLimit: number;
	validate: (value: string) => Validation;
	disabled?: boolean;
	disableLengthCounter?: boolean;
}) => {
	const [focused, setFocused] = useState(false);
	const { theme } = useTheme();
	const [error, setError] = useState<string | null>(null);

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
				`my-1 flex h-max w-full flex-col items-start justify-center`,
				className,
			)}
		>
			<div className={`h-5 w-full px-3`}>
				<AnimatePresence>
					{focused || passedValue.length > 0 ? (
						<motion.div
							className={`z-0 h-max w-max`}
							initial={{ y: "100%" }}
							animate={{
								y: 0,
								transition: { duration: 0.3 },
							}}
							exit={{
								y: "100%",
								transition: { duration: 0.3 },
							}}
						>
							<LUILabel name={name} className="px-4" />
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
			<input
				type="text"
				className={`h-10 w-full border ${
					theme === LTHEME.DARK
						? "border-neutral-700 bg-black text-white focus:border-neutral-300"
						: "border-neutral-300 bg-white text-black focus:border-neutral-700"
				} z-10 rounded-xl px-4 text-base transition-all duration-300 outline-none ${disabled ? "cursor-not-allowed" : "cursor-text"} `}
				placeholder={focused ? "" : name}
				value={passedValue}
				onChange={handleOnChange}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				disabled={disabled}
			/>
			<div
				className={`z-0 flex h-5 w-full items-end justify-between gap-x-4 px-3`}
			>
				{!disableLengthCounter ? (
					<div
						className={`h-auto w-max shrink-0 text-xs text-neutral-500`}
					>
						{passedValue.length}/{lengthLimit}
					</div>
				) : null}

				<AnimatePresence>
					{error ? (
						<motion.div
							className={`h-max w-max ${
								theme === LTHEME.DARK
									? "bg-neutral-700 text-neutral-300"
									: "bg-neutral-300 text-neutral-700"
							} rounded-b-md px-4 pt-1 text-xs`}
							initial={{ y: "-100%" }}
							animate={{
								y: "0%",
							}}
							exit={{
								y: "-100%",
							}}
						>
							{error}
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
		</div>
	);
};

export { Component as LUITextInputT1 };
