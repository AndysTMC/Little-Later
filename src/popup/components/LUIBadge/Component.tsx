import type { ReactNode } from "react";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import type { IconComponentType, LIconComponentType } from "../../../types";
import { useTheme } from "../../hooks/useTheme";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";

export type BadgeTone = "neutral" | "accent" | "muted" | "danger";
export type BadgeSize = "xs" | "sm";

/**
 * Standardized `rounded-full` status and metadata pill (docs/design.md,
 * Design system primitives).
 *
 * Uses Little Later's accent and neutral palette exclusively; `danger` is
 * reserved for destructive or error states.
 */
const Component = ({
	children,
	tone = "neutral",
	size = "xs",
	icon,
	iconWeight = "regular",
	className,
}: {
	children: ReactNode;
	tone?: BadgeTone;
	size?: BadgeSize;
	icon?: IconComponentType | LIconComponentType;
	iconWeight?: "regular" | "fill" | "bold";
	className?: string;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;

	const toneClass =
		tone === "accent"
			? "ll-accent-fill"
			: tone === "danger"
				? isDark
					? "bg-red-600/20 text-red-400"
					: "bg-red-600/10 text-red-600"
				: tone === "muted"
					? isDark
						? "border border-neutral-700 text-neutral-300"
						: "border border-neutral-300 text-neutral-600"
					: isDark
						? "bg-neutral-800 text-neutral-300"
						: "bg-neutral-200 text-neutral-700";

	const sizeClass =
		size === "sm"
			? "px-2.5 py-0.5 text-xs"
			: "px-2 py-0.5 text-[11px] leading-tight";

	return (
		<span
			className={twMerge(
				`inline-flex shrink-0 items-center gap-x-1 rounded-full font-medium ${sizeClass} ${toneClass}`,
				className,
			)}
		>
			{icon ? (
				<LUIThemedIcon
					Icon={icon}
					color="currentColor"
					weight={iconWeight}
					className={size === "sm" ? "size-3.5" : "size-3"}
				/>
			) : null}
			{children}
		</span>
	);
};

export { Component as LUIBadge };
