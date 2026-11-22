import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useRef, useState } from "react";
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
	// Holds only in-progress typing; null follows `passedValue` directly.
	const [typed, setTyped] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const commitTyped = () => {
		if (typed === null) return;
		const parsed = typed.trim() === "" ? minValue : Number(typed);
		const clamped = Number.isNaN(parsed)
			? passedValue
			: Math.min(maxValue, Math.max(minValue, parsed));
		setTyped(null);
		if (clamped !== passedValue) {
			onChange(clamped);
		}
	};

	const handleInputFocus = () => {
		setFocused(true);
	};

	const handleInputBlur = () => {
		commitTyped();
		setFocused(false);
	};

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
					<LUILabel
						name={name}
						className="justify-center text-[11px]"
					/>
				</motion.div>
				<AnimatePresence>
					{focused || hovered ? (
						<motion.button
							type="button"
							tabIndex={-1}
							aria-label={`Increase ${name}`}
							className={`absolute flex h-full w-full items-center justify-center border ${
								theme === LTHEME.DARK
									? "border-neutral-700 bg-neutral-900 hover:bg-neutral-800"
									: "border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
							} z-10 cursor-pointer rounded-t-lg`}
							initial={{ y: "100%" }}
							animate={{
								y: 0,
								transition: { duration: 0.1 },
							}}
							exit={{
								y: "100%",
								transition: { duration: 0.1 },
							}}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => {
								commitTyped();
								onShift(1);
							}}
						>
							<LUIThemedIcon
								Icon={CaretUpIcon}
								weight="fill"
								className="size-3.5"
							/>
						</motion.button>
					) : null}
				</AnimatePresence>
			</div>
			<input
				ref={inputRef}
				type="text"
				className={`h-10 w-full rounded-lg border text-center text-sm font-medium transition-colors ${
					theme === LTHEME.DARK
						? "border-neutral-700 bg-neutral-900 text-neutral-100 focus:border-neutral-400"
						: "border-neutral-300 bg-white text-neutral-900 focus:border-neutral-600"
				} z-20`}
				placeholder={name}
				aria-label={name}
				inputMode="numeric"
				value={typed ?? padded}
				onChange={(event) => {
					const raw = event.target.value;
					if (raw !== "" && !/^\d+$/.test(raw)) return;
					const nextNum = Number(raw);
					if (!focused) {
						if (raw !== "") onChange(nextNum);
						return;
					}
					setTyped(raw);
					// Committed as it is typed, not only on blur: the popup
					// closing while the field still has focus lost the edit.
					if (
						raw !== "" &&
						nextNum >= minValue &&
						nextNum <= maxValue
					) {
						onChange(nextNum);
					}
				}}
				onFocus={handleInputFocus}
				onBlur={handleInputBlur}
				maxLength={maxLength}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						commitTyped();
						inputRef.current?.blur();
					}
					// The arrows on screen appear on hover; these do the
					// same from the keyboard.
					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault();
						commitTyped();
						onShift(event.key === "ArrowUp" ? 1 : -1);
					}
				}}
			/>
			<div className={`h-5 w-full`}>
				<AnimatePresence>
					{focused || hovered ? (
						<motion.button
							type="button"
							tabIndex={-1}
							aria-label={`Decrease ${name}`}
							className={`flex h-full w-full items-center justify-center border ${
								theme === LTHEME.DARK
									? "border-neutral-700 bg-neutral-900 hover:bg-neutral-800"
									: "border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
							} z-10 cursor-pointer rounded-b-lg`}
							initial={{ y: "-100%" }}
							animate={{
								y: 0,
								transition: { duration: 0.1 },
							}}
							exit={{
								y: "-100%",
								transition: { duration: 0.1 },
							}}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => {
								commitTyped();
								onShift(-1);
							}}
						>
							<LUIThemedIcon
								Icon={CaretDownIcon}
								weight="fill"
								className="size-3.5"
							/>
						</motion.button>
					) : null}
				</AnimatePresence>
			</div>
		</div>
	);
};

export { Component as LUIDateNumInput };
