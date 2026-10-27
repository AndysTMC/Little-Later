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
				"flex h-12 w-72 items-center rounded-lg border border-solid transition-colors duration-150",
				isDark
					? "border-neutral-700 bg-neutral-900 focus-within:border-neutral-400"
					: "border-neutral-300 bg-neutral-100 focus-within:border-neutral-800",
				className,
			)}
		>
			<div
				className="flex h-12 w-16 shrink-0 items-center justify-center"
				aria-hidden
			>
				<LUIThemedIcon
					Icon={icon}
					weight="fill"
					className="h-7 w-7"
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
					if (event.key === "Enter" && onSubmit) {
						event.preventDefault();
						onSubmit();
					}
				}}
				className={`h-full min-w-0 grow appearance-none border-0 bg-transparent pr-4 text-xl font-light shadow-none ring-0 outline-none focus:outline-none focus-visible:outline-none ${
					isDark
						? "text-white placeholder:text-neutral-500"
						: "text-black placeholder:text-neutral-400"
				}`}
			/>
		</div>
	);
};

export { Component as LUIIconField };
