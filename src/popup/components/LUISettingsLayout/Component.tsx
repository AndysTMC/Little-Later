import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	pageName,
	children,
}: {
	className?: string;
	pageName: string;
	children: React.ReactNode;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	return (
		<div
			className={twMerge(
				`mx-auto flex min-h-0 w-full max-w-2xl grow flex-col gap-y-3 overflow-y-hidden px-4 pt-1 pb-4`,
				className,
			)}
		>
			<h1
				className={`shrink-0 px-1 text-2xl font-semibold tracking-tight ${
					isDark ? "text-white" : "text-black"
				}`}
			>
				{pageName}
			</h1>
			<div
				className={`min-h-0 w-full grow overflow-y-auto rounded-2xl border p-4 ${
					isDark
						? "border-neutral-800 bg-neutral-900/50"
						: "border-neutral-200 bg-neutral-100/50"
				} ${theme}-scrollbar`}
			>
				{children}
			</div>
		</div>
	);
};

export { Component as LUISettingsLayout };
