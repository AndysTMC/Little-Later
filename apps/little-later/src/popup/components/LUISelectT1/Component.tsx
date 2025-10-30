import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { capitalize } from "little-shared/utils/misc";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	passedItem,
	items,
	onChange,
}: {
	className?: string;
	passedItem: string;
	items: Array<string>;
	onChange: (value: string) => void;
}) => {
	const { theme } = useTheme();

	const [changeDirection, setChangeDirection] = useState(1);

	const leftAnimations = {
		initial: {
			opacity: 0,
			x: -10,
		},
		animate: {
			opacity: 1,
			x: 0,
		},
		exit: {
			opacity: 0,
			x: 10,
		},
	};

	const rightAnimations = {
		initial: {
			opacity: 0,
			x: 10,
		},
		animate: {
			opacity: 1,
			x: 0,
		},
		exit: {
			opacity: 0,
			x: -10,
		},
	};

	const handleChange = (change: number) => {
		setChangeDirection(change);
		const newItemIndex =
			(items.length + items.indexOf(passedItem) + change) % items.length;
		onChange(items[newItemIndex]);
	};

	return (
		<div
			className={twMerge(
				`flex h-max w-full items-center justify-between px-2`,
				className,
			)}
		>
			<button
				className={`h-max w-max cursor-pointer border p-1 ${
					theme === LTHEME.DARK
						? "border-white hover:bg-neutral-900"
						: "border-black hover:bg-neutral-100"
				} rounded-full`}
				onClick={() => handleChange(-1)}
			>
				<LUIThemedIcon
					Icon={CaretLeftIcon}
					color={theme === LTHEME.DARK ? "white" : "black"}
					weight="light"
					className={`size-4`}
				/>
			</button>
			<div
				className={`relative flex h-full grow items-center justify-center`}
			>
				<AnimatePresence>
					{items.map((item, index) =>
						item === passedItem ? (
							<motion.div
								key={index}
								className={`absolute h-full w-max ${
									theme === LTHEME.DARK
										? "text-white"
										: "text-black"
								} flex items-center justify-center`}
								{...(changeDirection === 1
									? rightAnimations
									: leftAnimations)}
								transition={{ duration: 0.3 }}
							>
								{capitalize(item)}
							</motion.div>
						) : null,
					)}
				</AnimatePresence>
			</div>
			<button
				className={`h-max w-max cursor-pointer border p-1 ${
					theme === LTHEME.DARK
						? "border-white hover:bg-neutral-900"
						: "border-black hover:bg-neutral-100"
				} rounded-full`}
				onClick={() => handleChange(1)}
			>
				<LUIThemedIcon
					Icon={CaretRightIcon}
					color={theme === LTHEME.DARK ? "white" : "black"}
					weight="light"
					className={`size-4`}
				/>
			</button>
		</div>
	);
};

export { Component as LUISelectT1 };
