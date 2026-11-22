import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { IconComponentType, LIconComponentType } from "../../../types";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	Icon,
	title,
}: {
	className?: string;
	Icon: IconComponentType | LIconComponentType;
	title?: string;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	return (
		<div
			className={twMerge(
				`relative z-20 flex h-11 w-full shrink-0 items-center justify-center px-4`,
				className,
			)}
		>
			<div
				className={`h-px w-full ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}
			/>
			<div
				className={`absolute flex items-center gap-x-2 rounded-xl border px-3 py-1.5 ${
					isDark
						? "border-neutral-800 bg-neutral-900 text-white"
						: "border-neutral-200 bg-neutral-100 text-black"
				}`}
			>
				<LUIThemedIcon
					Icon={Icon}
					color="currentColor"
					weight="regular"
					className="size-5"
				/>
				{title ? (
					<span className="text-sm font-semibold">{title}</span>
				) : null}
			</div>
		</div>
	);
};

export { Component as LUIFeaturePageUD };
