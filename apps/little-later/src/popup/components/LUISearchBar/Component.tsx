import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	handleSearch,
	setIsSearchFocused,
}: {
	className?: string;
	handleSearch: (text: string) => Promise<void>;
	setIsSearchFocused?: (isFocused: boolean) => void;
}) => {
	const { theme } = useTheme();
	const [text, setText] = useState<string>("");
	const [isFocused, setIsFocused] = useState<boolean>(false);
	const debounceTimeoutRef = useRef<number | null>(null);
	const handleOnChange = (text: string) => {
		setText(text);
		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
		}
		debounceTimeoutRef.current = window.setTimeout(() => {
			handleSearch(text);
		}, 300);
	};
	useEffect(() => {
		if (setIsSearchFocused) setIsSearchFocused(isFocused);
	}, [isFocused, setIsSearchFocused]);
	const handleFocus = () => {
		setIsFocused(true);
	};
	const handleUnfocus = () => {
		setText("");
		setIsFocused(false);
	};
	return (
		<div
			className={twMerge(
				`h-8 w-full border ${
					isFocused
						? "bg-transparent " +
							(theme === LTHEME.DARK
								? "border-neutral-700"
								: "border-neutral-300")
						: "border-transparent " +
							(theme === LTHEME.DARK
								? "bg-neutral-900"
								: "bg-neutral-100")
				} flex rounded-full pl-1`,
				className,
			)}
		>
			<div className={`flex h-full w-8 items-center justify-center`}>
				<LUIThemedIcon
					Icon={MagnifyingGlassIcon}
					className={`size-4`}
				/>
			</div>

			<input
				type="text"
				value={text}
				placeholder="Search"
				onChange={(e) => handleOnChange(e.target.value)}
				onFocus={handleFocus}
				className={`h-full grow text-sm font-bold text-neutral-500 ${theme === LTHEME.DARK ? "focus:text-neutral-100" : "focus:text-neutral-900"} rounded-full px-1 placeholder-current outline-none`}
			/>
			{isFocused ? (
				<div
					className={`flex h-full w-8 items-center justify-center bg-transparent ${theme === LTHEME.DARK ? "hover:bg-neutral-800" : "hover:bg-neutral-200"} cursor-pointer rounded-full`}
					onClick={handleUnfocus}
				>
					<LUIThemedIcon Icon={XIcon} className={`size-4`} />
				</div>
			) : null}
		</div>
	);
};

export { Component as LUISearchBar };
