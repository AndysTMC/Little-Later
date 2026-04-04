import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	isActive = false,
	onToggle,
}: {
	className?: string;
	isActive: boolean;
	onToggle: (value: boolean) => void;
}) => {
	const { theme } = useTheme();
	return (
		<div
			className={twMerge(
				`group relative flex h-6 w-12 cursor-pointer items-center outline-none`,
				className,
			)}
			onClick={() => onToggle(!isActive)}
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					onToggle(!isActive);
				}
			}}
		>
			<div
				className={`size-6 ${
					theme === LTHEME.DARK ? "bg-neutral-100" : "bg-neutral-900"
				} absolute z-10 rounded-full ${isActive ? "translate-x-full" : "translate-x-0"} transition-all duration-300 group-focus:ring ${theme === LTHEME.DARK ? "ring-white" : "ring-black"} `}
			></div>
			<div
				className={`h-5 w-full border ${
					!isActive
						? theme === LTHEME.DARK
							? "border-neutral-300"
							: "border-neutral-700"
						: (theme === LTHEME.DARK
								? "bg-neutral-800"
								: "bg-neutral-200") + " border-transparent"
				} z-0 rounded-full transition-all duration-300 group-focus:ring ${theme === LTHEME.DARK ? "ring-white" : "ring-black"} `}
			></div>
		</div>
	);
};

export { Component as LUIToggle };
