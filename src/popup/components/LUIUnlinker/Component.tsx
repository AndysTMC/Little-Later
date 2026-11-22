import { LTHEME } from "little-shared/enums";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { useTheme } from "../../hooks/useTheme";
import { XIcon } from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";

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
	const isDark = theme === LTHEME.DARK;
	return (
		<div
			className={twMerge(
				`flex h-max w-full items-center gap-x-2 rounded-xl px-2 py-1 ${
					isDark ? "bg-neutral-900" : "bg-neutral-100"
				}`,
				className,
			)}
		>
			<div
				className={`line-clamp-1 h-max grow text-sm ${isDark ? "text-neutral-100" : "text-neutral-900"}`}
			>
				{content}
			</div>
			<button
				type="button"
				className={`flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
					isDark
						? "text-neutral-400 hover:bg-neutral-800 hover:text-white"
						: "text-neutral-500 hover:bg-neutral-200 hover:text-black"
				}`}
				onClick={() => handleUnlink(id)}
				aria-label={`Unlink: ${content}`}
			>
				<LUIThemedIcon
					Icon={XIcon}
					color="currentColor"
					weight="regular"
					className="size-4"
				/>
			</button>
		</div>
	);
};

export { Component as LUIUnlinker };
