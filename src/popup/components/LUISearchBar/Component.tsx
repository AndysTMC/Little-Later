import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

const SEARCH_DELAY_MS = 300;

// Searching starts when the box gets focus and ends with the clear button,
// Escape, or leaving an empty box. Ending it clears the text and results.
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
	const [isSearching, setIsSearching] = useState<boolean>(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const pendingSearch = useRef<number | null>(null);

	// A search typed just before clearing must not bring its results back.
	const cancelPendingSearch = () => {
		if (pendingSearch.current !== null) {
			clearTimeout(pendingSearch.current);
			pendingSearch.current = null;
		}
	};
	useEffect(
		() => () => {
			if (pendingSearch.current !== null) {
				clearTimeout(pendingSearch.current);
			}
		},
		[],
	);

	useEffect(() => {
		setIsSearchFocused?.(isSearching);
	}, [isSearching, setIsSearchFocused]);

	const handleOnChange = (next: string) => {
		setText(next);
		cancelPendingSearch();
		pendingSearch.current = window.setTimeout(() => {
			pendingSearch.current = null;
			void handleSearch(next);
		}, SEARCH_DELAY_MS);
	};

	const endSearch = () => {
		cancelPendingSearch();
		setText("");
		setIsSearching(false);
		inputRef.current?.blur();
		void handleSearch("");
	};

	const isDark = theme === LTHEME.DARK;
	return (
		<div
			role="search"
			className={twMerge(
				`ll-field flex h-8 w-full rounded-full border pl-1 ${
					isSearching
						? "bg-transparent " +
							(isDark
								? "border-neutral-700"
								: "border-neutral-300")
						: "border-transparent " +
							(isDark ? "bg-neutral-900" : "bg-neutral-100")
				}`,
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
				ref={inputRef}
				// A search box to assistive technology; the browser's own
				// clear button is hidden, as the one below does more.
				type="search"
				value={text}
				placeholder="Search"
				aria-label="Search saves, tasks, reminders, and notes"
				onChange={(event) => handleOnChange(event.target.value)}
				onFocus={() => setIsSearching(true)}
				onBlur={() => {
					if (text === "") endSearch();
				}}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						endSearch();
					}
				}}
				className={`h-full grow appearance-none rounded-full border-0 bg-transparent px-1 text-sm font-bold text-neutral-500 placeholder-current ring-0 [&::-webkit-search-cancel-button]:hidden ${isDark ? "focus:text-neutral-100" : "focus:text-neutral-900"}`}
			/>
			{isSearching ? (
				<button
					type="button"
					aria-label="Clear search"
					// Keeps focus in the box, so leaving it empty does not end
					// the search before this button's own click.
					onMouseDown={(event) => event.preventDefault()}
					className={`flex h-full w-8 cursor-pointer items-center justify-center rounded-full bg-transparent ${isDark ? "hover:bg-neutral-800" : "hover:bg-neutral-200"}`}
					onClick={endSearch}
				>
					<LUIThemedIcon Icon={XIcon} className={`size-4`} />
				</button>
			) : null}
		</div>
	);
};

export { Component as LUISearchBar };
