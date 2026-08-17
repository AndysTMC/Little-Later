import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

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

	const [tempValue, setTempValue] = useState(passedValue);

	const maxLength = maxValue.toString().length;

	const handleChange = (value: number) => {
		if (value < minValue) {
			onChange(minValue);
		} else if (value > maxValue) {
			onChange(maxValue);
		} else {
			onChange(value);
		}
	};

	const [focused, setFocused] = useState(false);

	const handleBlur = () => {
		setFocused(false);
		handleChange(tempValue);
	};

	const handleShift = (shift: number) => {
		const newValue = tempValue + shift;
		if (newValue < minValue || newValue > maxValue) return;
		handleChange(tempValue + shift);
		setTempValue(tempValue + shift);
	};

	useEffect(() => {
		if (!focused) {
			setTempValue(passedValue);
		}
	}, [passedValue, focused]);

	return (
		<div
			className={twMerge(
				`flex h-max w-max rounded-full border-1 ${theme === LTHEME.DARK ? "border-neutral-100" : "border-neutral-900"} gap-x-1 p-1`,
				className,
			)}
		>
			<div className={`w-max`}>
				<input
					className={`flex rounded-full px-1 text-center ${
						theme === LTHEME.DARK
							? "text-white focus:bg-neutral-800"
							: "text-black focus:bg-neutral-200"
					} outline-none`}
					aria-label="Numeric value"
					type="text"
					style={{ width: `${32 + maxLength * 8}px` }}
					inputMode="numeric"
					value={tempValue}
					maxLength={maxLength}
					onChange={(event) => {
						if (isNaN(Number(event.target.value.toString())))
							return;
						return setTempValue(Number(event.target.value));
					}}
					onFocus={() => setFocused(true)}
					onBlur={handleBlur}
				/>
			</div>
			<button
				type="button"
				aria-label="Decrease value"
				className={`w-max cursor-pointer rounded-full p-1 ${
					theme === LTHEME.DARK
						? "hover:bg-neutral-800"
						: "hover:bg-neutral-200"
				}`}
				onClick={() => handleShift(-1)}
			>
				<LUIThemedIcon
					Icon={MinusIcon}
					weight="regular"
					className={`size-4`}
				/>
			</button>
			<button
				type="button"
				aria-label="Increase value"
				className={`w-max cursor-pointer rounded-full p-1 ${
					theme === LTHEME.DARK
						? "hover:bg-neutral-800"
						: "hover:bg-neutral-200"
				}`}
				onClick={() => handleShift(1)}
			>
				<LUIThemedIcon
					Icon={PlusIcon}
					weight="regular"
					className={`size-4`}
				/>
			</button>
		</div>
	);
};

export { Component as LUINumInput };
