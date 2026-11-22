import { ReactElement } from "react";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	name,
	icon,
	onClick,
}: {
	className?: string;
	name: string;
	icon: ReactElement;
	isLast?: boolean;
	animationDelay?: number;
	onClick?: () => void;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	return (
		<button
			type="button"
			className={twMerge(
				`flex h-9 w-full cursor-pointer items-center justify-start gap-x-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors ${
					isDark
						? "text-neutral-100 hover:bg-neutral-800"
						: "text-neutral-900 hover:bg-neutral-200"
				}`,
				className,
			)}
			onClick={onClick}
		>
			{icon}
			<span>{name}</span>
		</button>
	);
};

export { Component as LUIHMNavMenuOption };
