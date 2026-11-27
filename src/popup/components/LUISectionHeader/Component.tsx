import type { ReactNode } from "react";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";

/**
 * Standardized section heading with optional description and right-aligned
 * action or count slot (docs/design.md, Design system primitives).
 */
const Component = ({
	title,
	description,
	action,
	className,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
	className?: string;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;

	return (
		<div
			className={twMerge(
				"flex w-full items-start justify-between gap-x-3",
				className,
			)}
		>
			<div className="flex min-w-0 flex-col gap-y-0.5">
				<h2
					className={`text-sm font-semibold tracking-tight ${
						isDark ? "text-neutral-100" : "text-neutral-900"
					}`}
				>
					{title}
				</h2>
				{description ? (
					<p
						className={`text-xs leading-relaxed ${
							isDark ? "text-neutral-400" : "text-neutral-600"
						}`}
					>
						{description}
					</p>
				) : null}
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</div>
	);
};

export { Component as LUISectionHeader };
