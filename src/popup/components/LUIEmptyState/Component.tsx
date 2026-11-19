import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";

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
	const tone = theme === LTHEME.DARK ? "text-white" : "text-black";

	return (
		<div
			className={twMerge(
				"flex w-full grow flex-col items-center justify-center gap-y-2 px-8 py-10 text-center",
				className,
			)}
		>
			<h2 className={`text-2xl font-extrabold ${tone} opacity-70`}>
				{title}
			</h2>
			{hint ? (
				<p className={`text-base font-semibold ${tone} opacity-70`}>
					{hint}
				</p>
			) : null}
		</div>
	);
};

export { Component as LUIEmptyState };
