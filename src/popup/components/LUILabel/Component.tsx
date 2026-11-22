import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	name,
	htmlFor,
}: {
	className?: string;
	name: string;
	atBottom?: boolean;
	htmlFor?: string;
}) => {
	const { theme } = useTheme();
	const classNames = twMerge(
		`flex h-max w-full items-center text-xs font-medium ${
			theme === LTHEME.DARK ? "text-neutral-400" : "text-neutral-600"
		}`,
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
