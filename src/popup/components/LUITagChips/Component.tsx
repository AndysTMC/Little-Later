import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";

const Component = ({
	tags,
	activeTag,
	onSelect,
	maxVisible = 4,
	className,
}: {
	tags: ReadonlyArray<string>;
	activeTag?: string | null;
	onSelect?: (tag: string) => void;
	maxVisible?: number;
	className?: string;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;

	if (tags.length === 0) {
		return null;
	}

	const visible = tags.slice(0, maxVisible);
	const remaining = tags.length - visible.length;

	return (
		<div
			className={twMerge("flex flex-wrap items-center gap-1", className)}
		>
			{visible.map((tag) => {
				const isActive = activeTag === tag;
				const chipClass = `inline-flex max-w-28 items-center truncate rounded-full border px-2 py-0.5 text-[11px] leading-tight font-medium transition-colors ${
					isActive
						? "ll-accent-fill border-transparent"
						: isDark
							? "border-neutral-700/80 bg-neutral-800/80 text-neutral-300"
							: "border-neutral-300/80 bg-neutral-200/70 text-neutral-700"
				}`;

				if (onSelect) {
					return (
						<button
							key={tag}
							type="button"
							aria-label={`Filter by tag ${tag}`}
							aria-pressed={isActive}
							onClick={(event) => {
								event.stopPropagation();
								onSelect(tag);
							}}
							className={`${chipClass} cursor-pointer ${
								!isActive
									? isDark
										? "hover:border-neutral-600 hover:text-white"
										: "hover:border-neutral-400 hover:text-black"
									: ""
							}`}
						>
							<span className="truncate">#{tag}</span>
						</button>
					);
				}

				return (
					<span key={tag} className={chipClass}>
						<span className="truncate">#{tag}</span>
					</span>
				);
			})}
			{remaining > 0 ? (
				<span
					className={`text-[11px] font-medium ${
						isDark ? "text-neutral-500" : "text-neutral-500"
					}`}
				>
					+{remaining}
				</span>
			) : null}
		</div>
	);
};

export { Component as LUITagChips };
