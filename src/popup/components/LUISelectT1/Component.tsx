import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { capitalize } from "little-shared/utils/misc";
import { twMerge } from "tailwind-merge";

// A segmented control for a small set of mutually exclusive choices (Priority,
// Schedule type, Repeat cadence, Reminder type): every option is visible at
// once and selectable in a single click.
const Component = ({
	className,
	passedItem,
	items,
	onChange,
	labelOf = capitalize,
	ariaLabelOf,
}: {
	className?: string;
	passedItem: string;
	items: Array<string>;
	onChange: (value: string) => void;
	labelOf?: (item: string) => string;
	ariaLabelOf?: (item: string) => string;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const dense = items.length > 4;

	return (
		<div
			role="radiogroup"
			className={twMerge(
				`flex h-max w-full items-center gap-1 rounded-xl border p-1 ${
					isDark
						? "border-neutral-800 bg-neutral-900"
						: "border-neutral-200 bg-neutral-100"
				}`,
				className,
			)}
		>
			{items.map((item) => {
				const selected = item === passedItem;
				return (
					<button
						key={item}
						type="button"
						role="radio"
						aria-checked={selected}
						aria-label={ariaLabelOf ? ariaLabelOf(item) : undefined}
						onClick={() => onChange(item)}
						className={`flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg text-xs font-medium transition-colors ${
							dense ? "px-1" : "px-2"
						} ${
							selected
								? "ll-accent-fill"
								: isDark
									? "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
									: "text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900"
						}`}
					>
						<span className="truncate">{labelOf(item)}</span>
					</button>
				);
			})}
		</div>
	);
};

export { Component as LUISelectT1 };
