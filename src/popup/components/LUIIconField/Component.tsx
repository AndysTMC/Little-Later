import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { useTheme } from "../../hooks/useTheme";
import { IconComponentType } from "../../../types";

const Component = ({
	id,
	name,
	icon,
	value,
	onChange,
	placeholder,
	ariaLabel,
	type = "text",
	autoComplete,
	maxLength,
	passedTheme,
	className,
	onSubmit,
}: {
	id: string;
	name?: string;
	icon: IconComponentType;
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	ariaLabel: string;
	type?: "text" | "password";
	autoComplete?: string;
	maxLength?: number;
	passedTheme?: LTHEME;
	className?: string;
	onSubmit?: () => void;
}) => {
	const { theme: contextTheme } = useTheme();
	const theme = passedTheme ?? contextTheme;
	const isDark = theme === LTHEME.DARK;

	return (
		<div
			className={twMerge(
				"ll-field flex h-11 w-full max-w-72 items-center rounded-xl border border-solid transition-colors duration-150",
				isDark
					? "border-neutral-700 bg-neutral-900 focus-within:border-neutral-400"
					: "border-neutral-300 bg-white focus-within:border-neutral-700",
				className,
			)}
		>
			<div
				className={`flex h-full w-11 shrink-0 items-center justify-center ${
					isDark ? "text-neutral-400" : "text-neutral-500"
				}`}
				aria-hidden
			>
				<LUIThemedIcon
					Icon={icon}
					weight="regular"
					color="currentColor"
					className="size-5"
					passedTheme={theme}
				/>
			</div>
			<input
				id={id}
				name={name}
				type={type}
				placeholder={placeholder}
				aria-label={ariaLabel}
				autoComplete={autoComplete}
				maxLength={maxLength}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={(event) => {
					if (
						event.key === "Enter" &&
						!event.nativeEvent.isComposing &&
						onSubmit
					) {
						event.preventDefault();
						onSubmit();
					}
				}}
				className={`h-full min-w-0 grow appearance-none border-0 bg-transparent pr-3.5 text-sm font-normal shadow-none ring-0 ${
					isDark
						? "text-neutral-100 placeholder:text-neutral-500"
						: "text-neutral-900 placeholder:text-neutral-400"
				}`}
			/>
		</div>
	);
};

export { Component as LUIIconField };
