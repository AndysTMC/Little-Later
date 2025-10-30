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
	return (
		<div
			className={twMerge(
				`h-full w-full overflow-y-hidden px-5 py-5`,
				className,
			)}
		>
			<div
				className={`h-full w-full border ${theme === LTHEME.DARK ? "border-white" : "border-black"} relative rounded-lg pt-5`}
			>
				<div
					className={`h-10 w-max text-4xl font-semibold ${
						theme === LTHEME.DARK
							? "bg-black text-white"
							: "bg-white text-black"
					} absolute z-10 translate-x-5 -translate-y-10 px-2`}
				>
					{pageName}
				</div>
				<div
					className={`h-full w-full overflow-y-auto px-5 py-1 ${theme}-scrollbar `}
				>
					{children}
				</div>
			</div>
		</div>
	);
};

export { Component as LUISettingsLayout };
