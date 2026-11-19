import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { CaretUpDownIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { capitalize } from "little-shared/utils/misc";
import { twMerge } from "tailwind-merge";

// A dropdown that works from the keyboard: Enter, Space or the arrow keys
// open it, Tab and the arrow keys move through the choices, Enter picks
// one and Escape closes it. Focus moving to a choice does not close it;
// focus leaving the whole control does.
const Component = <T extends string>({
	className,
	testId,
	options,
	currentOption,
	onOptionChange,
	name,
	optionLabel = capitalize,
}: {
	className?: string;
	testId?: string;
	options: ReadonlyArray<T>;
	currentOption: T;
	onOptionChange: (option: T) => void;
	// What is being chosen, for its accessible name.
	name?: string;
	// How a choice reads; capitalized by default.
	optionLabel?: (option: T) => string;
}) => {
	const { theme } = useTheme();
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const focusOption = (index: number) => {
		const count = options.length;
		optionRefs.current[((index % count) + count) % count]?.focus();
	};

	const choose = (option: T) => {
		onOptionChange(option);
		setIsMenuOpen(false);
		rootRef.current?.focus();
	};

	return (
		<div
			ref={rootRef}
			// Open, it draws over the rows below it.
			className={twMerge(
				`group relative h-8 w-40 rounded-lg ${isMenuOpen ? "z-50" : ""}`,
				className,
			)}
			data-testid={testId}
			role="button"
			aria-haspopup="listbox"
			aria-expanded={isMenuOpen}
			aria-label={`${name ? `${name}: ` : ""}${optionLabel(currentOption)}, change`}
			tabIndex={0}
			onBlur={(event) => {
				// Still inside: a choice took focus.
				if (!event.currentTarget.contains(event.relatedTarget)) {
					setIsMenuOpen(false);
				}
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					setIsMenuOpen(false);
					rootRef.current?.focus();
					return;
				}
				if (event.target !== event.currentTarget) {
					return;
				}
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					setIsMenuOpen(!isMenuOpen);
				}
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					setIsMenuOpen(true);
					const current = options.indexOf(currentOption);
					// After the choices are drawn.
					requestAnimationFrame(() => focusOption(current));
				}
			}}
		>
			<div
				className={`flex h-8 w-full rounded-lg border ${
					theme === LTHEME.DARK
						? "border-neutral-700"
						: "border-neutral-300"
				}`}
				onClick={() => setIsMenuOpen(!isMenuOpen)}
			>
				<div
					className={`flex h-full grow items-center justify-center ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
				>
					{optionLabel(currentOption)}
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
					role="listbox"
					className={`relative right-0 mt-1 max-h-40 w-40 border ${
						theme === LTHEME.DARK
							? "border-neutral-700 bg-black"
							: "border-neutral-300 bg-white"
					} overflow-y-auto rounded-lg shadow-lg ${theme}-scrollbar `}
				>
					{options.map((option, index) => (
						<button
							type="button"
							role="option"
							aria-selected={currentOption === option}
							key={option}
							ref={(element) => {
								optionRefs.current[index] = element;
							}}
							className={`z-10 flex h-8 w-full cursor-pointer items-center justify-center ${
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
							onClick={() => choose(option)}
							onKeyDown={(event) => {
								if (event.key === "ArrowDown") {
									event.preventDefault();
									focusOption(index + 1);
								}
								if (event.key === "ArrowUp") {
									event.preventDefault();
									focusOption(index - 1);
								}
							}}
						>
							{optionLabel(option)}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
};

export { Component as LUISelectT2 };
