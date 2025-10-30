import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	name,
	atBottom = false,
}: {
	className?: string;
	name: string;
	atBottom?: boolean;
}) => {
	const { theme } = useTheme();
	return (
		<div
			className={twMerge(
				`flex h-max w-full items-center justify-center text-xs font-semibold ${
					theme === LTHEME.DARK
						? "bg-white text-black"
						: "bg-black text-white"
				} ${atBottom ? "rounded-b-md pb-1" : "rounded-t-md pt-1"} `,
				className,
			)}
		>
			{name}
		</div>
	);
};

export { Component as LUILabel };
