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
					className={`flex rounded-full px-1 ${theme === LTHEME.DARK ? "text-white" : "text-black"} text-center focus:${theme === LTHEME.DARK ? "bg-neutral-800" : "bg-neutral-200"} outline-none`}
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
			<div
				className={`w-max cursor-pointer rounded-full p-1 hover:${theme === LTHEME.DARK ? "bg-neutral-800" : "bg-neutral-200"}`}
				onClick={() => handleShift(-1)}
			>
				<LUIThemedIcon
					Icon={MinusIcon}
					weight="regular"
					className={`size-4`}
				/>
			</div>
			<div
				className={`w-max cursor-pointer rounded-full p-1 hover:${theme === LTHEME.DARK ? "bg-neutral-800" : "bg-neutral-200"} `}
				onClick={() => handleShift(1)}
			>
				<LUIThemedIcon
					Icon={PlusIcon}
					weight="regular"
					className={`size-4`}
				/>
			</div>
		</div>
	);
};

export { Component as LUINumInput };
