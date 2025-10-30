import { LTHEME } from "little-shared/enums";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LToast } from "little-shared/types";
import { LTOAST_TYPE_TO_ICON } from "../../../constants";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	theme,
	toast,
}: {
	className?: string;
	theme: LTHEME;
	toast: LToast;
}) => {
	return (
		<div
			className={twMerge(
				`justify-left flex w-96 items-center gap-x-1 rounded-lg px-2 py-1 opacity-90 ${theme === LTHEME.DARK ? "bg-neutral-900" : "bg-neutral-100"} outline-1 outline-neutral-500`,
				className,
			)}
		>
			<div className={`h-max w-max px-2`}>
				<LUIThemedIcon
					Icon={LTOAST_TYPE_TO_ICON[toast.type]}
					className={`size-4`}
					weight="fill"
				/>
			</div>
			<span
				className={`grow-1 text-left text-sm ${theme === LTHEME.DARK ? "text-white" : "text-black"}`}
			>
				{toast.message}
			</span>
		</div>
	);
};

export { Component as LUIToast };
