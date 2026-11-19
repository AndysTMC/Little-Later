import { LTHEME } from "little-shared/enums";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { useTheme } from "../../hooks/useTheme";
import { TrashIcon } from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";

import { pressable } from "../../a11y";

const Component = ({
	className,
	content,
	id,
	handleUnlink,
}: {
	className?: string;
	content: string;
	id: string;
	handleUnlink: (id: string) => void;
}) => {
	const { theme } = useTheme();
	return (
		<div
			className={twMerge(
				`flex h-max w-full items-center gap-x-1`,
				className,
			)}
		>
			<div
				className={`flex h-full w-max items-center justify-center border border-neutral-500 ${
					theme === LTHEME.DARK
						? "hover:bg-neutral-900"
						: "hover:bg-neutral-100"
				} cursor-pointer rounded-lg px-2`}
				{...pressable(() => handleUnlink(id))}
				aria-label={`Unlink: ${content}`}
			>
				<LUIThemedIcon
					Icon={TrashIcon}
					color={theme === LTHEME.DARK ? "white" : "black"}
					weight={"light"}
					className={`size-4`}
				/>
			</div>
			<div
				className={`line-clamp-1 h-max grow text-sm ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
			>
				{content}
			</div>
		</div>
	);
};

export { Component as LUIUnlinker };
