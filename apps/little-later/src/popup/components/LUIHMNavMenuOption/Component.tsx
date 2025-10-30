import { motion } from "framer-motion";
import { ReactElement } from "react";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	name,
	icon,
	isLast = false,
	animationDelay = 0,
	onClick,
}: {
	className?: string;
	name: string;
	icon: ReactElement;
	isLast?: boolean;
	animationDelay?: number;
	onClick?: () => void;
}) => {
	const { theme } = useTheme();
	return (
		<motion.div
			className={twMerge(
				`flex h-max w-full flex-col items-center justify-center ${
					theme === LTHEME.DARK
						? "bg-black hover:bg-neutral-800 focus:bg-neutral-800"
						: "bg-white hover:bg-neutral-200 focus:bg-neutral-200"
				} outline-none`,
				className,
			)}
			initial={{ opacity: 0, y: -10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.1, delay: animationDelay }}
			exit={{ opacity: 0, y: -10, transition: { duration: 0.1 } }}
			onClick={onClick}
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					onClick?.();
				}
			}}
		>
			<div
				className={`flex h-9 w-full cursor-pointer items-center justify-start gap-x-3 px-3 ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
			>
				{icon}
				<span>{name}</span>
			</div>
			{!isLast ? (
				<hr
					className={`h-0 w-36 shadow-none ${theme === LTHEME.DARK ? "border-neutral-700" : "border-neutral-300"} `}
				/>
			) : null}
		</motion.div>
	);
};

export { Component as LUIHMNavMenuOption };
