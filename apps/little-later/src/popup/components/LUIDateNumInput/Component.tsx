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
	const padding = "0".repeat(maxLength - passedValue.toString().length);
	const [tempValue, setTempValue] = useState(
		padding + passedValue.toString(),
	);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleInputFocus = () => {
		setTempValue(padding + passedValue.toString());
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
		setTempValue(passedValue.toString());
	}, [passedValue]);

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
				} z-20 text-base transition-all duration-300 outline-none`}
				placeholder={name}
				value={focused ? tempValue : padding + passedValue}
				onChange={(event) => {
					if (isNaN(Number(event.target.value.toString()))) return;
					return focused
						? setTempValue(event.target.value)
						: onChange(Number(event.target.value));
				}}
				onFocus={handleInputFocus}
				onBlur={handleInputBlur}
				maxLength={maxLength}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						handleInputBlur();
						inputRef.current?.blur();
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
