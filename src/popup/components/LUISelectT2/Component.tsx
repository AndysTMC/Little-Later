import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { CaretUpDownIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { capitalize } from "little-shared/utils/misc";
import { twMerge } from "tailwind-merge";

const Component = <T extends string>({
	className,
	options,
	currentOption,
	onOptionChange,
}: {
	className?: string;
	options: Array<T>;
	currentOption: T;
	onOptionChange: (option: T) => void;
}) => {
	const { theme } = useTheme();
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	return (
		<div
			className={twMerge(`group relative h-8 w-40 rounded-sm`, className)}
			tabIndex={0}
			onBlur={() => setIsMenuOpen(false)}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					setIsMenuOpen(!isMenuOpen);
				}
				if (e.key === "Escape") {
					setIsMenuOpen(false);
				}
			}}
		>
			<div
				className={`flex h-8 w-full rounded-md border ${
					theme === LTHEME.DARK
						? "border-neutral-300"
						: "border-neutral-700"
				} rounded-sm group-focus:ring ${theme === LTHEME.DARK ? "ring-white" : "ring-black"} `}
				onClick={() => setIsMenuOpen(!isMenuOpen)}
			>
				<div
					className={`flex h-full grow items-center justify-center ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
				>
					{capitalize(currentOption)}
				</div>
				<div className={`flex h-full items-center justify-center`}>
					<LUIThemedIcon
						Icon={CaretUpDownIcon}
						weight="light"
						color={theme === LTHEME.DARK ? "white" : "black"}
						className="size-5"
					/>
				</div>
			</div>
			{isMenuOpen ? (
				<div
					className={`relative right-0 mt-1 max-h-40 w-40 border ${
						theme === LTHEME.DARK
							? "border-neutral-100 bg-black"
							: "border-neutral-900 bg-white"
					} overflow-y-auto rounded-sm shadow-lg ${theme}-scrollbar `}
				>
					{options.map((option, index) => (
						<div
							key={index}
							className={`z-10 flex h-8 w-full items-center justify-center ${
								currentOption === option
									? theme === LTHEME.DARK
										? "bg-neutral-700"
										: "bg-neutral-300"
									: theme === LTHEME.DARK
										? "bg-neutral-950 hover:bg-neutral-900"
										: "bg-neutral-50 hover:bg-neutral-100"
							} ${
								theme === LTHEME.DARK
									? "text-white"
									: "text-black"
							} `}
							onClick={() => {
								onOptionChange(option);
								setIsMenuOpen(false);
							}}
						>
							{capitalize(option)}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
};

export { Component as LUISelectT2 };
