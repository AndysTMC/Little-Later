import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import type { IconComponentType } from "../../../types";

// A short note beside a form or setting (docs/design.md, Notes): an icon
// and quiet italic text. A warning is announced as an alert; anything else
// is a status, read when it changes.
const Component = ({
	children,
	warning = false,
	icon,
	passedTheme,
	className,
}: {
	children: React.ReactNode;
	warning?: boolean;
	icon?: IconComponentType;
	passedTheme?: LTHEME;
	className?: string;
}) => {
	const { theme: contextTheme } = useTheme();
	const theme = passedTheme ?? contextTheme;
	const isDark = theme === LTHEME.DARK;
	const tone = warning
		? isDark
			? "text-red-400"
			: "text-red-600"
		: isDark
			? "text-neutral-400"
			: "text-neutral-600";
	return (
		<div
			role={warning ? "alert" : "status"}
			className={twMerge(
				`flex h-max w-full max-w-72 shrink-0 items-start gap-x-2 ${tone}`,
				className,
			)}
		>
			<LUIThemedIcon
				Icon={icon ?? (warning ? WarningCircleIcon : InfoIcon)}
				weight="fill"
				color="currentColor"
				className="mt-0.5 size-4 shrink-0"
				passedTheme={theme}
			/>
			<div className="min-w-0 text-xs leading-relaxed italic">
				{children}
			</div>
		</div>
	);
};

export { Component as LUINote };
