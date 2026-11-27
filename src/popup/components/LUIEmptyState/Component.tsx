import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";

/** Centered empty-state placeholder with title and optional guidance hint. */
const Component = ({
	title,
	hint,
	className,
}: {
	title: string;
	hint?: string;
	className?: string;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;

	return (
		<div
			className={twMerge(
				"flex w-full grow flex-col items-center justify-center gap-y-1.5 px-6 py-10 text-center",
				className,
			)}
		>
			<h2
				className={`text-lg font-semibold tracking-tight ${
					isDark ? "text-neutral-200" : "text-neutral-800"
				}`}
			>
				{title}
			</h2>
			{hint ? (
				<p
					className={`max-w-xs text-sm ${
						isDark ? "text-neutral-400" : "text-neutral-500"
					}`}
				>
					{hint}
				</p>
			) : null}
		</div>
	);
};

export { Component as LUIEmptyState };
