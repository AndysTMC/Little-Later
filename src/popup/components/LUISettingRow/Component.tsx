import { CaretRightIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import type { Move } from "../../../route-transitions";
import type { IconComponentType, LIconComponentType } from "../../../types";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { LUISelectT2 } from "../LUISelectT2/Component";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";

// Settings rows. A link row is the one the Settings page lists its pages
// with; a choice row is the setting's name with the app's own dropdown.
// The carousel select belongs to the forms that create things.

// A row that opens a page. Rows in one list either all have an icon or
// none do.
const LUISettingLink = ({
	label,
	to,
	referrer,
	icon,
	move = "forward",
}: {
	label: string;
	to: string;
	// Where the opened page's Back returns to.
	referrer: string;
	icon?: IconComponentType | LIconComponentType;
	move?: Move;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const go = useMoveNavigate();
	return (
		<button
			type="button"
			className={`group flex h-10 w-full cursor-pointer items-center justify-start gap-x-2 rounded-full p-1 ${icon ? "" : "pl-3"} ${isDark ? "hover:bg-neutral-900" : "hover:bg-neutral-100"}`}
			onClick={() => go(to, move, { state: { referrer } })}
		>
			{icon ? (
				<div className="flex h-10 w-10 items-center justify-center">
					<LUIThemedIcon
						Icon={icon}
						weight="light"
						className="size-7"
					/>
				</div>
			) : null}
			<span className={`text-xl ${isDark ? "text-white" : "text-black"}`}>
				{label}
			</span>
			<div className="flex grow justify-end">
				<div className="flex h-10 w-10 -translate-x-1 items-center justify-center opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
					<LUIThemedIcon
						Icon={CaretRightIcon}
						weight="light"
						className="size-5"
					/>
				</div>
			</div>
		</button>
	);
};

// One choice out of a few.
const LUISettingSelect = <V extends string | number>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: V;
	options: ReadonlyArray<{ value: V; label: string }>;
	onChange: (value: V) => void;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const labelOf = new Map(
		options.map((option) => [String(option.value), option.label]),
	);
	return (
		<div className="flex w-full items-center justify-between gap-x-3 py-2">
			<span className={`text-lg ${isDark ? "text-white" : "text-black"}`}>
				{label}
			</span>
			<LUISelectT2
				name={label}
				options={options.map((option) => String(option.value))}
				currentOption={String(value)}
				optionLabel={(option) => labelOf.get(option) ?? option}
				onOptionChange={(chosen) => {
					const option = options.find(
						(candidate) => String(candidate.value) === chosen,
					);
					if (option) onChange(option.value);
				}}
			/>
		</div>
	);
};

export { LUISettingLink, LUISettingSelect };
