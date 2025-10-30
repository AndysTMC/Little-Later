import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { useTheme } from "../../hooks/useTheme";
import { capitalize } from "little-shared/utils/misc";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { IconComponentType, LIconComponentType } from "../../../types";

const Component = ({
	className,
	Icon,
	name,
	value,
	setValue,
	isPassword = false,
	isDisabled = false,
}: {
	className?: string;
	Icon: IconComponentType | LIconComponentType;
	name: string;
	value: string;
	setValue: (value: string) => void;
	isPassword?: boolean;
	isDisabled?: boolean;
}) => {
	const { theme } = useTheme();
	return (
		<div
			className={twMerge(
				`flex h-12 w-full min-w-72 items-center rounded-lg border border-solid ${
					theme === LTHEME.DARK
						? "border-neutral-700 bg-neutral-900"
						: "border-neutral-300 bg-neutral-100"
				} ${isDisabled ? "opacity-50" : ""} `,
				className,
			)}
		>
			<div className={`flex h-12 w-16 items-center justify-center`}>
				<LUIThemedIcon Icon={Icon} weight="fill" className="h-7 w-7" />
			</div>
			<div className={`h-full grow pr-1`}>
				<input
					type={isPassword ? "password" : "text"}
					placeholder={capitalize(name)}
					value={value}
					onChange={(event) => setValue(event.target.value)}
					disabled={isDisabled}
					className={`h-full w-full text-xl font-thin ${theme === LTHEME.DARK ? "text-white" : "text-black"} border-none bg-transparent outline-none`}
				/>
			</div>
		</div>
	);
};

export { Component as LUITextInputT2 };
