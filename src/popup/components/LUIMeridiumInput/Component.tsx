import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useState } from "react";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { LUILabel } from "../LUILabel/Component";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	passedValue,
	onShift,
}: {
	className?: string;
	passedValue: string;
	onShift: (direction: -1 | 1) => void;
}) => {
	const { theme } = useTheme();
	const [hovered, setHovered] = useState(false);
	const [focused, setFocused] = useState(false);

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
						name={"A"}
						className="justify-center text-[11px]"
					/>
				</motion.div>
				<AnimatePresence>
					{focused || hovered ? (
						<motion.button
							type="button"
							tabIndex={-1}
							aria-label="Toggle AM or PM"
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
							onClick={() => onShift(1)}
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
				type="text"
				readOnly
				className={`h-10 w-full rounded-lg border text-center text-sm font-medium transition-colors ${
					theme === LTHEME.DARK
						? "border-neutral-700 bg-neutral-900 text-neutral-100 focus:border-neutral-400"
						: "border-neutral-300 bg-white text-neutral-900 focus:border-neutral-600"
				} z-20`}
				placeholder={"A"}
				aria-label="AM or PM. Use the arrow keys to change it."
				value={passedValue}
				onKeyDown={(event) => {
					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault();
						onShift(event.key === "ArrowUp" ? 1 : -1);
					}
				}}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				maxLength={2}
			/>
			<div className={`h-5 w-full`}>
				<AnimatePresence>
					{focused || hovered ? (
						<motion.button
							type="button"
							tabIndex={-1}
							aria-label="Toggle AM or PM"
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
							onClick={() => onShift(-1)}
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

export { Component as LUIMeridiumInput };
