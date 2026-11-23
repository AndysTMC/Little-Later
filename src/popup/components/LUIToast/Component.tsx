import {
	CheckCircleIcon,
	InfoIcon,
	WarningCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LToast } from "little-shared/types";
import { twMerge } from "tailwind-merge";

const LTOAST_TYPE_TO_ICON = {
	[LTOAST_TYPE.SUCCESS]: CheckCircleIcon,
	[LTOAST_TYPE.ERROR]: XCircleIcon,
	[LTOAST_TYPE.INFO]: InfoIcon,
	[LTOAST_TYPE.WARNING]: WarningCircleIcon,
};

const Component = ({
	className,
	theme,
	toast,
}: {
	className?: string;
	theme: LTHEME;
	toast: LToast;
}) => {
	const isDark = theme === LTHEME.DARK;
	const iconTone =
		toast.type === LTOAST_TYPE.ERROR
			? "text-red-500"
			: toast.type === LTOAST_TYPE.WARNING
				? "text-amber-500"
				: "text-[var(--ll-accent)]";

	return (
		<div
			role="status"
			className={twMerge(
				`flex w-[min(22rem,calc(100vw-2rem))] items-center gap-x-2.5 rounded-xl border px-3.5 py-2.5 shadow-lg ${
					isDark
						? "border-neutral-800 bg-neutral-900 text-neutral-100"
						: "border-neutral-200 bg-white text-neutral-900"
				}`,
				className,
			)}
		>
			<span className={`flex shrink-0 items-center ${iconTone}`}>
				<LUIThemedIcon
					Icon={LTOAST_TYPE_TO_ICON[toast.type]}
					className="size-4"
					weight="fill"
					color="currentColor"
					passedTheme={theme}
				/>
			</span>
			<span className="grow text-left text-sm leading-snug">
				{toast.message}
			</span>
		</div>
	);
};

export { Component as LUIToast };
