import { useEffect, useRef, useState } from "react";
import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";

const SLOW_MS = 150;

// The app's one action button (docs/design.md, Buttons).
// - primary: solid accent fill, label only. One per view.
// - secondary: outlined, label only: the other ways out (Cancel, Delete
//   on the lock screen, a recovery code instead of the key).
// - danger: red, label only: the second press of something that can't be
//   undone, such as "Confirm delete".
export type ButtonVariant = "primary" | "secondary" | "danger";

const Component = ({
	className,
	name,
	onClick,
	passedTheme,
	disabled = false,
	variant = "primary",
}: {
	className?: string;
	name: string;
	onClick: () => Promise<void> | void;
	passedTheme?: LTHEME;
	disabled?: boolean;
	variant?: ButtonVariant;
}) => {
	const { theme: profileTheme } = useTheme();
	const theme = passedTheme ?? profileTheme;
	// Pending blocks a second press at once; the spinner only shows once
	// the action has taken long enough to need it.
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
	const cursor = isPending
		? "cursor-progress"
		: disabled
			? "cursor-not-allowed opacity-50"
			: "cursor-pointer";

	return (
		<motion.button
			type="button"
			disabled={disabled || isPending}
			aria-busy={isPending}
			aria-label={isExpanded ? name : undefined}
			className={twMerge(
				`flex h-11 w-full max-w-72 shrink-0 items-center justify-center rounded-xl border text-sm font-medium transition-colors ${cursor} ${
					variant === "primary"
						? "ll-accent-fill border-transparent hover:opacity-90"
						: variant === "danger"
							? "border-red-600 bg-red-600 text-white hover:bg-red-700"
							: isDark
								? "border-neutral-700 bg-transparent text-neutral-100 hover:bg-neutral-900"
								: "border-neutral-300 bg-transparent text-neutral-900 hover:bg-neutral-100"
				}`,
				className,
			)}
			whileTap={disabled || isPending ? undefined : { scale: 0.98 }}
			transition={{ duration: 0.1 }}
			onClick={!isPending && !disabled ? handleClick : undefined}
		>
			{isExpanded ? (
				<LUIThemedIcon
					Icon={CircleNotchIcon}
					className="size-5 animate-spin"
					color="currentColor"
				/>
			) : (
				name
			)}
		</motion.button>
	);
};

export { Component as LUICUButton };
