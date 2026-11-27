import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import type { IconComponentType } from "../types";
import { useTheme } from "../popup/hooks/useTheme";
import {
	LUITooltip,
	type TooltipPlacement,
} from "../popup/components/LUITooltip/Component";

// LittleAI's own controls (docs/design.md, LittleAI). A chat is dense and
// conversational: controls are compact and quiet until needed, and the
// accent marks the one thing to do next. They draw from the same palette
// and focus ring as the popup.

const useDark = () => useTheme().theme === LTHEME.DARK;

/**
 * Round, borderless icon button with a delayed, keyboard-accessible tooltip
 * (`LUITooltip`) for LittleAI's header and message controls.
 */
export const IconButton = ({
	label,
	icon: Icon,
	onClick,
	size = "md",
	active = false,
	tooltipPlacement = "bottom",
	className,
	buttonRef,
}: {
	label: string;
	icon: IconComponentType;
	onClick: () => void;
	size?: "sm" | "md";
	active?: boolean;
	tooltipPlacement?: TooltipPlacement;
	className?: string;
	buttonRef?: React.Ref<HTMLButtonElement>;
}) => {
	const dark = useDark();
	return (
		<LUITooltip content={label} placement={tooltipPlacement}>
			<button
				ref={buttonRef}
				type="button"
				aria-label={label}
				aria-pressed={active || undefined}
				onClick={onClick}
				className={twMerge(
					`flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-all duration-150 active:scale-95 ${size === "sm" ? "size-7" : "size-9"} ${
						active
							? "ll-accent-fill"
							: dark
								? "text-neutral-300 hover:bg-neutral-900 hover:text-white"
								: "text-neutral-600 hover:bg-neutral-100 hover:text-black"
					}`,
					className,
				)}
			>
				<Icon
					weight="regular"
					className={size === "sm" ? "size-4" : "size-5"}
				/>
			</button>
		</LUITooltip>
	);
};

/** Quiet inline text action under a chat message (Copy, Retry, Undo). */
export const TextAction = ({
	label,
	icon: Icon,
	onClick,
	ariaLabel,
}: {
	label: string;
	icon: IconComponentType;
	onClick: () => void;
	ariaLabel?: string;
}) => {
	const dark = useDark();
	return (
		<button
			type="button"
			aria-label={ariaLabel}
			onClick={onClick}
			className={`flex h-7 cursor-pointer items-center gap-x-1.5 rounded-lg px-2 text-xs font-medium transition-all duration-150 active:scale-95 ${dark ? "text-neutral-400 hover:bg-neutral-800 hover:text-white" : "text-neutral-500 hover:bg-neutral-200 hover:text-black"}`}
		>
			<Icon weight="regular" className="size-3.5" />
			{label}
		</button>
	);
};
