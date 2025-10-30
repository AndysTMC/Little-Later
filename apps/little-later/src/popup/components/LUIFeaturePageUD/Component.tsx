import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { IconComponentType, LIconComponentType } from "../../../types";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	Icon,
}: {
	className?: string;
	Icon: IconComponentType | LIconComponentType;
}) => {
	const { theme } = useTheme();
	return (
		<div
			className={twMerge(
				`relative z-50 flex h-16 w-full shrink-0 items-end justify-center`,
				className,
			)}
		>
			<hr
				className={`h-0 w-full border-t ${
					theme === LTHEME.DARK
						? "border-neutral-700"
						: "border-neutral-300"
				} -translate-y-8`}
			></hr>
			<div
				className={`absolute h-16 w-16 rounded-xl ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} border ${
					theme === LTHEME.DARK
						? "border-neutral-700"
						: "border-neutral-300"
				} flex items-center justify-center`}
			>
				<LUIThemedIcon
					Icon={Icon}
					color={theme === LTHEME.DARK ? "white" : "black"}
					weight="bold"
					className="h-12 w-12"
				/>
			</div>
		</div>
	);
};

export { Component as LUIFeaturePageUD };
