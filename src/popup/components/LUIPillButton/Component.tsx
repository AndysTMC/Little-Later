import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";

// A compact action inside a card: Edit, Collapse, Mark done, Delete
// (docs/design.md, Buttons). Quiet neutral surface at rest; danger tone
// is the armed state of LUIDeleteButton.
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
	tone?: "default" | "ghostDanger" | "danger";
	disabled?: boolean;
	className?: string;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const toneClass =
		tone === "danger"
			? "bg-red-600 text-white hover:bg-red-700"
			: tone === "ghostDanger"
				? isDark
					? "bg-transparent text-neutral-400 hover:bg-red-600/15 hover:text-red-400"
					: "bg-transparent text-neutral-500 hover:bg-red-600/10 hover:text-red-600"
				: isDark
					? "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
					: "bg-neutral-200 text-neutral-800 hover:bg-neutral-300";

	return (
		<button
			type="button"
			aria-label={ariaLabel}
			disabled={disabled}
			className={twMerge(
				`h-max w-max shrink-0 cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`,
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
