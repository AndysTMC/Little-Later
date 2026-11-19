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
	return (
		<div
			role={warning ? "alert" : "status"}
			className={twMerge(
				"flex h-max w-72 shrink-0 gap-x-1 opacity-75",
				className,
			)}
		>
			<LUIThemedIcon
				Icon={icon ?? (warning ? WarningCircleIcon : InfoIcon)}
				weight="fill"
				className="h-5 w-5 shrink-0"
				passedTheme={theme}
			/>
			<div
				className={`text-sm italic ${theme === LTHEME.DARK ? "text-white" : "text-black"}`}
			>
				{children}
			</div>
		</div>
	);
};

export { Component as LUINote };
