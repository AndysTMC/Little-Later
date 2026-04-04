import { useState } from "react";
import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { CaretRightIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";

const Component = ({
	className,
	name,
	onClick,
	passedTheme,
}: {
	className?: string;
	name: string;
	onClick: () => Promise<void>;
	passedTheme: LTHEME;
}) => {
	const { theme: profileTheme } = useTheme();
	const theme = passedTheme ?? profileTheme;
	const [isExpanded, setIsExpanded] = useState(false);

	const handleClick = async () => {
		setIsExpanded(true);
		try {
			await onClick();
		} finally {
			setIsExpanded(false);
		}
	};

	return (
		<button
			className={twMerge(
				`h-12 w-72 ${
					theme === LTHEME.DARK
						? "border-white bg-black hover:bg-neutral-900"
						: "border-black bg-white hover:bg-neutral-100"
				} flex overflow-hidden rounded-lg border ${className} ${isExpanded ? "cursor-progress" : "cursor-pointer"}`,
				className,
			)}
			onClick={!isExpanded ? handleClick : () => {}}
		>
			<motion.div
				className={` ${theme === LTHEME.DARK ? "bg-white text-black" : "bg-black text-white"} flex h-full items-center justify-center ${!isExpanded ? "" : "rounded-lg"} `}
				animate={{
					width: isExpanded ? "100%" : "25%",
				}}
				transition={{ duration: 0.3 }}
			>
				{isExpanded ? (
					<LUIThemedIcon
						Icon={CircleNotchIcon}
						className="size-6 animate-spin"
						invertTheme={true}
						passedTheme={theme}
					/>
				) : (
					<LUIThemedIcon
						Icon={CaretRightIcon}
						className="size-6"
						invertTheme={true}
						passedTheme={theme}
					/>
				)}
			</motion.div>

			<motion.div
				className={`h-full ${theme === LTHEME.DARK ? "bg-black text-white" : "bg-white text-black"} flex items-center justify-center text-base`}
				animate={{
					width: isExpanded ? "0%" : "75%",
					opacity: isExpanded ? 0 : 1,
				}}
				transition={{ duration: 0.3 }}
			>
				{name}
			</motion.div>
		</button>
	);
};

export { Component as LUICUButton };
