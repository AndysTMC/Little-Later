import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	name,
	atBottom = false,
	htmlFor,
}: {
	className?: string;
	name: string;
	atBottom?: boolean;
	htmlFor?: string;
}) => {
	const { theme } = useTheme();
	const classNames = twMerge(
		`flex h-max w-full items-center justify-center text-xs font-semibold ${
			theme === LTHEME.DARK
				? "bg-white text-black"
				: "bg-black text-white"
		} ${atBottom ? "rounded-b-md pb-1" : "rounded-t-md pt-1"} `,
		className,
	);
	if (htmlFor) {
		return (
			<label htmlFor={htmlFor} className={classNames}>
				{name}
			</label>
		);
	}
	return <div className={classNames}>{name}</div>;
};

export { Component as LUILabel };
