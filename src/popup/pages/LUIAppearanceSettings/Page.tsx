import { motion } from "framer-motion";
import { CheckIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { useId, useState } from "react";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISettingSelect } from "../../components/LUISettingRow/Component";
import { LUINote } from "../../components/LUINote/Component";
import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import {
	ACCENTS,
	accentColorOf,
	colorFromDials,
	dialsOf,
	isAccentColor,
	type Accent,
} from "../../../appearance";

const THEME_CHOICES = [
	{ value: "system", label: "System" },
	{ value: "light", label: "Little Light" },
	{ value: "dark", label: "Little Dark" },
] as const;

const ACCENT_KEYS = Object.keys(ACCENTS) as Array<Accent>;
// The Custom swatch before it is chosen: every hue it can be.
const RAINBOW = `conic-gradient(${[0, 60, 120, 180, 240, 300, 360]
	.map((hue) => colorFromDials(hue, 80))
	.join(", ")})`;

// One accent swatch: a native radio inside, so the group is one Tab stop
// and the arrow keys move the choice.
const Swatch = ({
	accent,
	chosen,
	fill,
	isDark,
	onChoose,
}: {
	accent: Accent;
	chosen: boolean;
	fill: string;
	isDark: boolean;
	onChoose: () => void;
}) => (
	<label
		title={ACCENTS[accent].label}
		className={`ll-choice flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 transition-transform hover:scale-110 ${
			chosen
				? isDark
					? "border-white"
					: "border-black"
				: "border-transparent"
		}`}
	>
		<input
			type="radio"
			name="accent"
			value={accent}
			checked={chosen}
			onChange={onChoose}
			className="sr-only"
		/>
		<span className="sr-only">{ACCENTS[accent].label}</span>
		<span
			aria-hidden
			className="flex h-6 w-6 items-center justify-center rounded-full"
			style={{ background: fill }}
		>
			{chosen ? (
				<CheckIcon
					weight="bold"
					className="size-4"
					// White on a colour and on black; black on Mono's white
					// swatch in the dark theme. Exact, not the palette's.
					color={accent === "mono" && isDark ? "#000000" : "#ffffff"}
				/>
			) : null}
		</span>
	</label>
);

// A labelled slider for the Custom colour, its track showing what each
// position gives.
const Dial = ({
	label,
	value,
	max,
	track,
	onChange,
}: {
	label: string;
	value: number;
	max: number;
	track: string;
	onChange: (value: number) => void;
}) => {
	const id = useId();
	return (
		<div className="flex w-full items-center gap-x-3">
			<label htmlFor={id} className="w-20 shrink-0 text-sm">
				{label}
			</label>
			<input
				id={id}
				type="range"
				min={0}
				max={max}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
				className="ll-dial grow"
				style={{ background: track }}
			/>
		</div>
	);
};

// The Custom colour: two dials, or a colour typed as #rrggbb.
const CustomColor = ({ isDark }: { isDark: boolean }) => {
	const { accentColor, setAccentColor } = useTheme();
	const { hue, strength } = dialsOf(accentColor);
	// What is in the box while it is being typed in; otherwise it shows
	// the colour the dials make.
	const [typed, setTyped] = useState<string | null>(null);
	const shown = typed ?? accentColor;
	const hexId = useId();
	const valid = isAccentColor(shown.trim().toLowerCase());
	return (
		<div
			className={`flex w-full flex-col gap-y-3 rounded-xl border px-4 py-3 ${isDark ? "border-neutral-700 text-white" : "border-neutral-300 text-black"}`}
		>
			<Dial
				label="Hue"
				value={hue}
				max={359}
				track={`linear-gradient(to right, ${[
					0, 60, 120, 180, 240, 300, 359,
				]
					.map((at) => colorFromDials(at, Math.max(strength, 40)))
					.join(", ")})`}
				onChange={(next) =>
					setAccentColor(colorFromDials(next, strength))
				}
			/>
			<Dial
				label="Strength"
				value={strength}
				max={100}
				track={`linear-gradient(to right, ${colorFromDials(hue, 0)}, ${colorFromDials(hue, 100)})`}
				onChange={(next) => setAccentColor(colorFromDials(hue, next))}
			/>
			<div className="flex w-full items-center gap-x-3">
				<label htmlFor={hexId} className="w-20 shrink-0 text-sm">
					Colour
				</label>
				<input
					id={hexId}
					type="text"
					spellCheck={false}
					maxLength={7}
					value={shown}
					aria-invalid={!valid}
					onFocus={() => setTyped(accentColor)}
					onBlur={() => setTyped(null)}
					onChange={(event) => {
						const next = event.target.value;
						setTyped(next);
						const color = next.trim().toLowerCase();
						if (isAccentColor(color)) setAccentColor(color);
					}}
					className={`h-9 w-28 rounded-lg border px-3 font-mono text-sm ${isDark ? "border-neutral-700 bg-neutral-950" : "border-neutral-300 bg-white"}`}
				/>
				{valid ? null : (
					<span className="text-xs text-neutral-500">
						Like #0e7490
					</span>
				)}
			</div>
		</div>
	);
};

// How the popup looks: light or dark, and the colour it is drawn in.
const Page = () => {
	const { theme, preference, setPreference, accent, setAccent, accentColor } =
		useTheme();
	const pageMotion = usePageMotion();
	const isDark = theme === LTHEME.DARK;

	return (
		<motion.div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${isDark ? "bg-black" : "bg-white"}`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo="/settings" />
			<LUISettingsLayout pageName="Appearance">
				<div className="flex w-full flex-col gap-y-1 pt-1 pb-4">
					<LUISettingSelect
						label="Theme"
						value={preference}
						options={THEME_CHOICES}
						onChange={setPreference}
					/>

					<fieldset className="flex w-full flex-col gap-y-2 border-0 p-0 py-2">
						<legend
							className={`pb-2 text-lg ${isDark ? "text-white" : "text-black"}`}
						>
							Accent
						</legend>
						{/* One row: the standard set, then Custom. */}
						<div className="flex w-full flex-wrap gap-1">
							{ACCENT_KEYS.map((key) => (
								<Swatch
									key={key}
									accent={key}
									chosen={key === accent}
									isDark={isDark}
									onChoose={() => setAccent(key)}
									fill={
										key === "mono"
											? isDark
												? "#ffffff"
												: "#000000"
											: key === "custom"
												? key === accent
													? accentColorOf(
															"custom",
															accentColor,
														)!
													: RAINBOW
												: ACCENTS[key].color!
									}
								/>
							))}
						</div>
						<LUINote className="w-full">
							Colours the whole popup: its background, text and
							icons. Chrome doesn't let extensions read its own
							colour, so pick the nearest one or set your own.
						</LUINote>
						{accent === "custom" ? (
							<CustomColor isDark={isDark} />
						) : null}
					</fieldset>
				</div>
			</LUISettingsLayout>
		</motion.div>
	);
};

export { Page as LUIAppearanceSettings };
