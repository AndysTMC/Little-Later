import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";

const Component = ({
	className,
	passedValue,
	onChange,
	minValue = 0,
	maxValue = 9,
}: {
	className?: string;
	passedValue: number;
	onChange: (value: number) => void;
	minValue?: number;
	maxValue?: number;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	// Holds raw string while typing so users can clear and retype cleanly.
	const [typed, setTyped] = useState<string | null>(null);

	const maxLength = maxValue.toString().length;

	const clamp = (value: number) =>
		Math.min(maxValue, Math.max(minValue, value));

	const commitTyped = () => {
		if (typed === null) return;
		const parsed = typed.trim() === "" ? minValue : Number(typed);
		const next = Number.isNaN(parsed) ? passedValue : clamp(parsed);
		setTyped(null);
		onChange(next);
	};

	const handleShift = (shift: number) => {
		const base =
			typed !== null &&
			typed.trim() !== "" &&
			!Number.isNaN(Number(typed))
				? Number(typed)
				: passedValue;
		const newValue = base + shift;
		if (newValue < minValue || newValue > maxValue) return;
		setTyped(null);
		onChange(newValue);
	};

	const stepButton = `flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors ${
		isDark
			? "text-neutral-300 hover:bg-neutral-800 hover:text-white"
			: "text-neutral-700 hover:bg-neutral-200 hover:text-black"
	}`;

	return (
		<div
			className={twMerge(
				`ll-field flex h-9 w-max shrink-0 items-center gap-x-0.5 rounded-xl border px-1 ${
					isDark
						? "border-neutral-700 bg-neutral-900"
						: "border-neutral-300 bg-white"
				}`,
				className,
			)}
		>
			<button
				type="button"
				aria-label="Decrease value"
				className={stepButton}
				onClick={() => handleShift(-1)}
			>
				<LUIThemedIcon
					Icon={MinusIcon}
					color="currentColor"
					weight="regular"
					className="size-3.5"
				/>
			</button>
			<input
				className={`h-7 rounded-lg px-1 text-center text-sm font-medium outline-none ${
					isDark
						? "text-neutral-100 focus:bg-neutral-800"
						: "text-neutral-900 focus:bg-neutral-100"
				}`}
				aria-label="Numeric value"
				type="text"
				style={{ width: `${28 + maxLength * 8}px` }}
				inputMode="numeric"
				value={typed ?? String(passedValue)}
				maxLength={maxLength}
				onChange={(event) => {
					const raw = event.target.value;
					if (raw !== "" && !/^\d+$/.test(raw)) return;
					setTyped(raw);
					// Committed as soon as it is in range, not only on blur.
					if (raw !== "") {
						const num = Number(raw);
						if (num >= minValue && num <= maxValue) {
							onChange(num);
						}
					}
				}}
				onBlur={commitTyped}
			/>
			<button
				type="button"
				aria-label="Increase value"
				className={stepButton}
				onClick={() => handleShift(1)}
			>
				<LUIThemedIcon
					Icon={PlusIcon}
					color="currentColor"
					weight="regular"
					className="size-3.5"
				/>
			</button>
		</div>
	);
};

export { Component as LUINumInput };
