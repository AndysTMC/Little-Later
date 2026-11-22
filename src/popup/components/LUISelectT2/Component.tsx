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
	const isDark = theme === LTHEME.DARK;
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const focusOption = (index: number) => {
		const count = options.length;
		if (count === 0) return;
		optionRefs.current[((index % count) + count) % count]?.focus();
	};

	const choose = (option: T) => {
		onOptionChange(option);
		setIsMenuOpen(false);
		triggerRef.current?.focus();
	};

	return (
		<div
			// Open, it draws over the rows below it.
			className={twMerge(
				`group relative h-9 w-36 shrink-0 rounded-xl min-[380px]:w-40 ${isMenuOpen ? "z-50" : ""}`,
				className,
			)}
			onBlur={(event) => {
				// Still inside: a choice took focus.
				if (!event.currentTarget.contains(event.relatedTarget)) {
					setIsMenuOpen(false);
				}
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					setIsMenuOpen(false);
					triggerRef.current?.focus();
				}
			}}
		>
			<button
				ref={triggerRef}
				type="button"
				data-testid={testId}
				aria-haspopup="listbox"
				aria-expanded={isMenuOpen}
				aria-label={`${name ? `${name}: ` : ""}${optionLabel(currentOption)}, change`}
				className={`flex h-9 w-full cursor-pointer items-center justify-between gap-x-2 rounded-xl border px-3 text-sm font-medium transition-colors ${
					isDark
						? "border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-neutral-600"
						: "border-neutral-300 bg-white text-neutral-900 hover:border-neutral-400"
				}`}
				onClick={() => setIsMenuOpen(!isMenuOpen)}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						if (options.length === 0) return;
						setIsMenuOpen(true);
						const current = Math.max(
							0,
							options.indexOf(currentOption),
						);
						// After the choices are drawn.
						requestAnimationFrame(() => focusOption(current));
					}
				}}
			>
				<span className="truncate">{optionLabel(currentOption)}</span>
				<LUIThemedIcon
					Icon={CaretUpDownIcon}
					weight="regular"
					color="currentColor"
					className="size-4 shrink-0 opacity-60"
				/>
			</button>
			{isMenuOpen ? (
				<div
					role="listbox"
					className={`absolute right-0 mt-1 flex max-h-44 w-44 flex-col gap-y-0.5 overflow-y-auto rounded-xl border p-1 shadow-lg ${
						isDark
							? "border-neutral-800 bg-neutral-900"
							: "border-neutral-200 bg-white"
					} ${theme}-scrollbar`}
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
							className={`block h-8 w-full shrink-0 cursor-pointer truncate rounded-lg px-2.5 text-left text-sm leading-8 transition-colors ${
								currentOption === option
									? "ll-accent-fill font-medium"
									: isDark
										? "text-neutral-200 hover:bg-neutral-800"
										: "text-neutral-800 hover:bg-neutral-100"
							}`}
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
