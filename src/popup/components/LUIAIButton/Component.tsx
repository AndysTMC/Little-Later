import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { StarFourIcon } from "@phosphor-icons/react";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useRef, useState } from "react";

import { attempt } from "../../attempt";

const Component = ({
	className,
	name,
	onClick,
}: {
	className?: string;
	name: string;
	onClick: () => Promise<void> | void;
}) => {
	const { theme } = useTheme();
	const [isLoading, setIsLoading] = useState(false);
	const busyRef = useRef(false);
	const handleClick = async () => {
		if (busyRef.current) return;
		busyRef.current = true;
		setIsLoading(true);
		try {
			await attempt(onClick, "The AI couldn't do that.");
		} finally {
			busyRef.current = false;
			setIsLoading(false);
		}
	};
	return (
		<button
			type="button"
			disabled={isLoading}
			aria-busy={isLoading}
			className={twMerge(
				`flex min-h-8 w-full cursor-pointer items-center justify-center gap-x-1.5 rounded-xl border border-transparent px-2.5 py-1.5 transition-all duration-200 disabled:cursor-wait ${isLoading ? (theme === LTHEME.DARK ? "bg-neutral-100" : "bg-neutral-900") : theme === LTHEME.DARK ? "bg-neutral-800 hover:bg-neutral-700" : "bg-neutral-200 hover:bg-neutral-300"} ${isLoading ? "animate-pulse" : ""}`,
				className,
			)}
			onClick={handleClick}
		>
			<span className="flex shrink-0 items-center justify-center">
				<LUIThemedIcon
					Icon={StarFourIcon}
					color={
						isLoading
							? theme === LTHEME.DARK
								? "black"
								: "white"
							: theme === LTHEME.DARK
								? "white"
								: "black"
					}
					weight="fill"
					className={`size-3 transition-all duration-200 ${isLoading ? "animate-ping" : ""}`}
				/>
			</span>
			<span
				className={`truncate text-xs font-medium whitespace-nowrap transition-all duration-200 ${isLoading ? (theme === LTHEME.DARK ? "text-black" : "text-white") : theme === LTHEME.DARK ? "text-white" : "text-black"}`}
			>
				{name}
			</span>
		</button>
	);
};

export { Component as LUIAIButton };
