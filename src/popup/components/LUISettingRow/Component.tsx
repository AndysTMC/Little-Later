import { CaretRightIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import type { Move } from "../../../route-transitions";
import type { IconComponentType, LIconComponentType } from "../../../types";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { LUISelectT2 } from "../LUISelectT2/Component";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";

// Settings rows. A link row opens a page; a choice row pairs the setting's
// name with the app's own dropdown (LUISelectT2).

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
			className={`group flex h-11 w-full cursor-pointer items-center justify-start gap-x-2.5 rounded-xl px-2.5 transition-colors ${isDark ? "hover:bg-neutral-800/80" : "hover:bg-neutral-200/70"}`}
			onClick={() => go(to, move, { state: { referrer } })}
		>
			{icon ? (
				<div className="flex size-8 shrink-0 items-center justify-center">
					<LUIThemedIcon
						Icon={icon}
						weight="regular"
						className="size-5"
					/>
				</div>
			) : null}
			<span
				className={`text-base font-medium ${isDark ? "text-neutral-100" : "text-neutral-900"}`}
			>
				{label}
			</span>
			<div className="flex grow justify-end">
				<div
					className={`flex size-8 items-center justify-center transition-transform duration-150 group-hover:translate-x-0.5 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
				>
					<LUIThemedIcon
						Icon={CaretRightIcon}
						color="currentColor"
						weight="regular"
						className="size-4"
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
	testId,
}: {
	label: string;
	value: V;
	options: ReadonlyArray<{ value: V; label: string }>;
	onChange: (value: V) => void;
	testId?: string;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const labelOf = new Map(
		options.map((option) => [String(option.value), option.label]),
	);
	return (
		<div className="flex w-full items-center justify-between gap-x-3 py-2">
			<span
				className={`min-w-0 text-sm font-medium ${isDark ? "text-neutral-100" : "text-neutral-900"}`}
			>
				{label}
			</span>
			<LUISelectT2
				name={label}
				testId={testId}
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
