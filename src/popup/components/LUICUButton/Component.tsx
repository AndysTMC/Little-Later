import { useEffect, useRef, useState } from "react";
import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { CaretRightIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";

const SLOW_MS = 150;

const Component = ({
	className,
	name,
	onClick,
	passedTheme,
	disabled = false,
}: {
	className?: string;
	name: string;
	onClick: () => Promise<void>;
	passedTheme: LTHEME;
	disabled?: boolean;
}) => {
	const { theme: profileTheme } = useTheme();
	const theme = passedTheme ?? profileTheme;
	// Pending blocks a second press at once; the spinner sweep only shows
	// once the action has taken long enough to need it.
	const [isPending, setIsPending] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);
	const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (slowTimer.current) clearTimeout(slowTimer.current);
		},
		[],
	);

	const handleClick = async () => {
		setIsPending(true);
		slowTimer.current = setTimeout(() => setIsExpanded(true), SLOW_MS);
		try {
			await onClick();
		} finally {
			if (slowTimer.current) clearTimeout(slowTimer.current);
			slowTimer.current = null;
			setIsPending(false);
			setIsExpanded(false);
		}
	};
	const isDark = theme === LTHEME.DARK;

	return (
		<motion.button
			type="button"
			disabled={disabled || isPending}
			aria-busy={isPending}
			className={twMerge(
				`group flex h-12 w-72 overflow-hidden rounded-lg border ${
					isDark ? "border-white bg-black" : "border-black bg-white"
				} ${
					isPending
						? "cursor-progress"
						: disabled
							? "cursor-not-allowed opacity-60"
							: "cursor-pointer"
				}`,
				className,
			)}
			whileTap={disabled || isPending ? undefined : { scale: 0.97 }}
			transition={{ duration: 0.1 }}
			onClick={!isPending && !disabled ? handleClick : undefined}
		>
			<motion.div
				className={`ll-accent-fill flex h-full items-center justify-center ${!isExpanded ? "" : "rounded-lg"} `}
				animate={{
					width: isExpanded ? "100%" : "25%",
				}}
				transition={{ duration: 0.3 }}
			>
				{isExpanded ? (
					<LUIThemedIcon
						Icon={CircleNotchIcon}
						className="size-6 animate-spin"
						color="currentColor"
					/>
				) : (
					<LUIThemedIcon
						Icon={CaretRightIcon}
						className={`size-6 transition-transform duration-150 ${disabled ? "" : "group-hover:translate-x-1"}`}
						color="currentColor"
					/>
				)}
			</motion.div>

			<motion.div
				className={`h-full ${isDark ? "bg-black text-white" : "bg-white text-black"} ${disabled ? "" : isDark ? "group-hover:bg-neutral-900" : "group-hover:bg-neutral-100"} flex items-center justify-center text-base transition-colors`}
				animate={{
					width: isExpanded ? "0%" : "75%",
					opacity: isExpanded ? 0 : 1,
				}}
				transition={{ duration: 0.3 }}
			>
				{name}
			</motion.div>
		</motion.button>
	);
};

export { Component as LUICUButton };
