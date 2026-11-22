import { CaretRightIcon } from "@phosphor-icons/react";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useState } from "react";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";

import { pressable } from "../../a11y";

const Component = ({
	className,
	content,
	navigateTo,
	hoverBackground = "",
	disableNavs = false,
}: {
	className?: string;
	content: string;
	navigateTo: string;
	hoverBackground: string;
	disableNavs?: boolean;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const go = useMoveNavigate();
	const [hovered, setHovered] = useState(false);
	const handleOnClick = () => {
		if (disableNavs) return;
		go(navigateTo, "forward");
	};
	return (
		<div
			className={twMerge(
				`my-0.5 flex min-h-8 w-full items-center gap-x-2 rounded-lg px-2 py-1 transition-colors ${disableNavs ? "" : "cursor-pointer"} ${hovered ? hoverBackground : ""}`,
				className,
			)}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			{...(disableNavs ? {} : pressable(handleOnClick))}
		>
			<div className="min-w-0 grow">
				<div
					className={`text-xs leading-snug font-medium break-words ${isDark ? "text-neutral-200" : "text-neutral-800"}`}
				>
					{content}
				</div>
			</div>

			{!disableNavs ? (
				<div
					className={`flex size-5 shrink-0 items-center justify-center transition-transform duration-150 ${hovered ? "translate-x-0.5" : ""} ${
						isDark ? "text-neutral-400" : "text-neutral-500"
					}`}
				>
					<LUIThemedIcon
						Icon={CaretRightIcon}
						color="currentColor"
						weight="regular"
						className="size-3.5"
					/>
				</div>
			) : null}
		</div>
	);
};

export { Component as LUILink };
