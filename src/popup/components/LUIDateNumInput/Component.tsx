import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useEffect, useRef, useState } from "react";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { LUILabel } from "../LUILabel/Component";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	name,
	passedValue,
	onChange,
	onShift,
	minValue = 0,
	maxValue = 9,
	maxLength = 1,
}: {
	className?: string;
	name: string;
	passedValue: number;
	onChange: (value: number) => void;
	onShift: (shift: number) => void;
	minValue?: number;
	maxValue?: number;
	maxLength?: number;
}) => {
	const { theme } = useTheme();
	const [hovered, setHovered] = useState(false);
	const [focused, setFocused] = useState(false);
	const padded = String(passedValue).padStart(maxLength, "0");
	const [tempValue, setTempValue] = useState(padded);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleInputFocus = () => {
		setTempValue(padded);
		setFocused(true);
	};

	const handleInputBlur = () => {
		const tempValueNum = Number(tempValue);
		if (tempValueNum < minValue) {
			onChange(minValue);
		} else if (tempValueNum > maxValue) {
			onChange(maxValue);
		} else {
			onChange(tempValueNum);
		}
		setFocused(false);
	};

	useEffect(() => {
		// Not while it is being typed in: the value just typed comes back
		// here, and replacing the text would move the caret.
		if (!focused) {
			setTempValue(passedValue.toString());
		}
	}, [passedValue, focused]);

	return (
		<div
			className={twMerge(`flex h-max w-full flex-col`, className)}
			onMouseOver={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<div className={`relative h-5 w-full`}>
				<motion.div
					className={`absolute z-0 h-max w-full cursor-pointer`}
					initial={{ y: "100%" }}
					animate={{
						y: 0,
						transition: { duration: 0.1 },
					}}
					exit={{
						y: "100%",
						transition: { duration: 0.1 },
					}}
				>
					<LUILabel name={name} />
				</motion.div>
				<AnimatePresence>
					{focused || hovered ? (
						<motion.div
							className={`absolute flex h-full w-full items-center justify-center border ${
								theme === LTHEME.DARK
									? "border-white bg-black"
									: "border-black bg-white"
							} z-10 cursor-pointer rounded-t-md`}
							initial={{ y: "100%" }}
							animate={{
								y: 0,
								transition: { duration: 0.1 },
							}}
							exit={{
								y: "100%",
								transition: { duration: 0.1 },
							}}
							onClick={() => onShift(1)}
						>
							<LUIThemedIcon
								Icon={CaretUpIcon}
								weight="fill"
								className="size-4"
							/>
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
			<input
				ref={inputRef}
				type="text"
				className={`h-10 w-full border text-center ${
					theme === LTHEME.DARK
						? "border-neutral-700 bg-black text-white focus:border-neutral-300"
						: "border-neutral-300 bg-white text-black focus:border-neutral-700"
				} z-20 text-base transition-all duration-300`}
				placeholder={name}
				aria-label={name}
				inputMode="numeric"
				value={focused ? tempValue : padded}
				onChange={(event) => {
					if (isNaN(Number(event.target.value.toString()))) return;
					const typed = Number(event.target.value);
					if (!focused) {
						return onChange(typed);
					}
					setTempValue(event.target.value);
					// Committed as it is typed, not only on blur: the popup
					// closing while the field still has focus lost the edit.
					if (
						event.target.value !== "" &&
						typed >= minValue &&
						typed <= maxValue
					) {
						onChange(typed);
					}
				}}
				onFocus={handleInputFocus}
				onBlur={handleInputBlur}
				maxLength={maxLength}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						handleInputBlur();
						inputRef.current?.blur();
					}
					// The arrows on screen appear on hover; these do the
					// same from the keyboard.
					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault();
						handleInputBlur();
						onShift(event.key === "ArrowUp" ? 1 : -1);
					}
				}}
			/>
			<div className={`h-5 w-full`}>
				<AnimatePresence>
					{focused || hovered ? (
						<motion.div
							className={`flex h-max w-full items-center justify-center border ${
								theme === LTHEME.DARK
									? "border-white bg-black"
									: "border-black bg-white"
							} z-10 cursor-pointer rounded-b-md`}
							initial={{ y: "-100%" }}
							animate={{
								y: 0,
								transition: { duration: 0.1 },
							}}
							exit={{
								y: "-100%",
								transition: { duration: 0.1 },
							}}
							onClick={() => onShift(-1)}
						>
							<LUIThemedIcon
								Icon={CaretDownIcon}
								weight="fill"
								className="size-4"
							/>
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
		</div>
	);
};

export { Component as LUIDateNumInput };
