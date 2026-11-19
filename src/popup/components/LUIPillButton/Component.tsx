import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";

// A small action inside a card: Edit, Collapse, Mark done (docs/design.md,
// Buttons). Words, not icons, so every action in a card reads the same.
// The danger tone is the armed state of LUIDeleteButton.
const Component = ({
	label,
	onClick,
	ariaLabel,
	tone = "default",
	disabled = false,
	className,
}: {
	label: string;
	onClick: () => void;
	ariaLabel?: string;
	tone?: "default" | "danger";
	disabled?: boolean;
	className?: string;
}) => {
	const { theme } = useTheme();
	return (
		<button
			type="button"
			aria-label={ariaLabel}
			disabled={disabled}
			className={twMerge(
				`h-max w-max shrink-0 cursor-pointer rounded-full px-2 py-1 text-xs transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
					tone === "danger"
						? "bg-red-600 text-white"
						: theme === LTHEME.DARK
							? "bg-white text-black"
							: "bg-black text-white"
				}`,
				className,
			)}
			onClick={(event) => {
				// Cards open on a click; their actions must not open them.
				event.stopPropagation();
				onClick();
			}}
		>
			{label}
		</button>
	);
};

export { Component as LUIPillButton };
