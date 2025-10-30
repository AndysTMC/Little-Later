import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { StarFourIcon } from "@phosphor-icons/react";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useState } from "react";
import { fakeWait } from "little-shared";

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
	const handleClick = async () => {
		setIsLoading(true);
		await fakeWait();
		await onClick();
		setIsLoading(false);
	};
	return (
		<button
			className={twMerge(
				`flex h-8 w-full cursor-pointer items-center justify-center gap-x-2 rounded-md border border-transparent transition-all duration-200 ${isLoading ? (theme === LTHEME.DARK ? "bg-neutral-100" : "bg-neutral-900") : theme === LTHEME.DARK ? "bg-neutral-800" : "bg-neutral-200"} ${isLoading ? "animate-pulse" : ""}`,
				className,
			)}
			onClick={handleClick}
		>
			<span className={`flex h-full w-max items-center justify-center`}>
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
				className={`transition-all duration-200 ${isLoading ? (theme === LTHEME.DARK ? "text-black" : "text-white") : theme === LTHEME.DARK ? "text-white" : "text-black"} text-sm`}
			>
				{name}
			</span>
		</button>
	);
};

export { Component as LUIAIButton };
