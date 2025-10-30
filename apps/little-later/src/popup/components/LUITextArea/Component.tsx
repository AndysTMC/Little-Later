import { LTHEME } from "little-shared/enums";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { Validation } from "../../../types";
import { useTheme } from "../../hooks/useTheme";
import { LUILabel } from "../LUILabel/Component";

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
	const [focused, setFocused] = useState(false);
	const { theme } = useTheme();
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
			adjustHeight();
		}
		onChange(value);
	};

	useEffect(() => {
		// adjusst height after 500ms
		const timeout = setTimeout(() => {
			adjustHeight();
		}, 1);
		return () => {
			clearTimeout(timeout);
		};
	}, []);

	return (
		<div
			className={twMerge(
				`my-1 flex h-max w-full flex-col items-start justify-center`,
				className,
			)}
		>
			{showLabel ? (
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
			) : null}

			<textarea
				ref={textareaRef}
				className={`min-h-12 w-full border ${
					theme === LTHEME.DARK
						? "border-neutral-700 bg-black text-white focus:border-neutral-300"
						: "border-neutral-300 bg-white text-black focus:border-neutral-700"
				} z-10 resize-none overflow-hidden rounded-xl px-4 pt-2 pb-4 text-base transition-all duration-300 outline-none`}
				placeholder={focused ? "" : name}
				value={passedValue}
				onChange={handleOnChange}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
			/>
			<div
				className={`z-0 flex h-4.5 w-full items-end justify-between gap-x-4 px-3`}
			>
				<div
					className={`h-auto w-max shrink-0 text-xs text-neutral-500`}
				>
					{passedValue.length}/{lengthLimit}
				</div>
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
								y: 0,
								transition: { type: "inertia" },
							}}
							exit={{
								y: "-100%",
								transition: { type: "inertia" },
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

export { Component as LUITextArea };
