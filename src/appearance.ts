// How a profile's popup looks, beyond light or dark: an accent colour, one
// of a standard set or the profile's own. Plain profile preferences, like
// the theme; the worker checks them and the popup applies them.

// The accent colours the whole popup: its background, text, lines and
// icons are drawn from the accent's hue (accentPalette), and highlights
// (focus outlines, the active tab, the caret block of the main buttons)
// are the accent itself, with white on it at WCAG's 4.5:1. Mono is plain
// black and white, as before. Custom is the profile's accentColor.
export const ACCENTS = {
	mono: { label: "Mono", color: null },
	red: { label: "Red", color: "#b91c1c" },
	orange: { label: "Orange", color: "#c2410c" },
	amber: { label: "Amber", color: "#b45309" },
	green: { label: "Green", color: "#15803d" },
	teal: { label: "Teal", color: "#0f766e" },
	blue: { label: "Blue", color: "#2563eb" },
	indigo: { label: "Indigo", color: "#4f46e5" },
	purple: { label: "Purple", color: "#7c3aed" },
	pink: { label: "Pink", color: "#db2777" },
	custom: { label: "Custom", color: null },
} as const;
export type Accent = keyof typeof ACCENTS;

export const DEFAULT_ACCENT: Accent = "mono";
// Custom starts here until the profile picks its own.
export const DEFAULT_CUSTOM_COLOR = "#0e7490";

export const isAccent = (value: unknown): value is Accent =>
	typeof value === "string" && Object.hasOwn(ACCENTS, value);

export const isAccentColor = (value: unknown): value is string =>
	typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);

// Colour arithmetic in OKLCH, where lightness is perceptual: a tinted
// scale keeps the lightness of the plain one, and so its contrast.

type Rgb = [number, number, number];

const toLinear = (channel: number) =>
	channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const fromLinear = (channel: number) =>
	channel <= 0.0031308
		? 12.92 * channel
		: 1.055 * channel ** (1 / 2.4) - 0.055;

const hexToLinear = (hex: string): Rgb =>
	[1, 3, 5].map((start) =>
		toLinear(parseInt(hex.slice(start, start + 2), 16) / 255),
	) as Rgb;

const linearToHex = (rgb: Rgb): string =>
	"#" +
	rgb
		.map((channel) =>
			Math.round(Math.min(1, Math.max(0, fromLinear(channel))) * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("");

const linearToOklch = ([r, g, b]: Rgb) => {
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	return { L, C: Math.hypot(A, B), H: Math.atan2(B, A) };
};

const oklchToLinear = (L: number, C: number, H: number): Rgb => {
	const A = C * Math.cos(H);
	const B = C * Math.sin(H);
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
};

const inGamut = (rgb: Rgb) =>
	rgb.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4);

// The colour at this lightness and hue, with as much of the chroma asked
// for as sRGB can show.
const oklchHex = (L: number, C: number, H: number): string => {
	let chroma = C;
	while (chroma > 0 && !inGamut(oklchToLinear(L, chroma, H))) {
		chroma -= 0.002;
	}
	return linearToHex(oklchToLinear(L, Math.max(0, chroma), H));
};

// WCAG 2 contrast between two #rrggbb colours.
export const contrast = (a: string, b: string): number => {
	const luminance = (hex: string) => {
		const [r, g, bl] = hexToLinear(hex);
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (high + 0.05) / (low + 0.05);
};

export const NEUTRAL_STEPS = [
	50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;

// Tailwind's neutral lightness, step by step, and how much of the accent's
// hue each step takes: a wash in the light steps, more in the middle,
// where borders and quiet text are. The middle step is a little darker on
// light pages and lighter on dark ones: chroma and the tinted page cost it
// some contrast as quiet text.
const NEUTRAL_L = (dark: boolean) => [
	0.97,
	0.955,
	0.915,
	0.87,
	0.708,
	dark ? 0.57 : 0.53,
	0.439,
	0.371,
	dark ? 0.31 : 0.269,
	// A dark page is itself a little lighter than black, so the fills
	// drawn on it (hover, fields) move with it to stay visible.
	dark ? 0.255 : 0.205,
	dark ? 0.165 : 0.145,
];
const NEUTRAL_C = [
	0.014, 0.018, 0.024, 0.032, 0.05, 0.06, 0.06, 0.055, 0.045, 0.038, 0.03,
];

// How much of the accent's hue the page takes: paler accents tint less.
const strengthOf = (C: number) => Math.min(1, C / 0.15);

// What goes on a highlight (the active tab's text, a button's caret): the
// accent's palest tint, the light page's own colour, not pure white.
export const inkOf = (hex: string): string => {
	const { C, H } = linearToOklch(hexToLinear(hex));
	return oklchHex(0.985, 0.016 * strengthOf(C), H);
};

// A colour its ink reads on at WCAG's 4.5:1: the colour itself, or as much
// darker as that takes. Any custom colour works as a highlight.
export const highlightOf = (hex: string): string => {
	const { L, C, H } = linearToOklch(hexToLinear(hex));
	const ink = inkOf(hex);
	let lightness = L;
	let color = hex.toLowerCase();
	while (contrast(color, ink) < 4.5 && lightness > 0) {
		lightness -= 0.01;
		color = oklchHex(lightness, C, H);
	}
	return color;
};

// The highlight an accent draws in, null for Mono's black and white.
export const accentColorOf = (
	accent: Accent,
	customColor: string | null,
): string | null => {
	const color =
		accent === "custom"
			? (customColor ?? DEFAULT_CUSTOM_COLOR)
			: ACCENTS[accent].color;
	return color === null ? null : highlightOf(color);
};

// A custom colour from the picker's two dials: hue (0–360) and strength
// (0–100), at a lightness that takes white text.
export const colorFromDials = (hue: number, strength: number): string =>
	highlightOf(oklchHex(0.55, (strength / 100) * 0.2, (hue * Math.PI) / 180));

export const dialsOf = (hex: string): { hue: number; strength: number } => {
	const { C, H } = linearToOklch(hexToLinear(hex));
	return {
		hue: Math.round(((((H * 180) / Math.PI) % 360) + 360) % 360),
		strength: Math.round(Math.min(100, (C / 0.2) * 100)),
	};
};

// The colours the popup is drawn with under an accent: Tailwind's black,
// white and neutral scale, redefined from the accent's highlight colour
// (null for Mono, which keeps them). Light pages are a pale wash with dark
// accent ink; dark pages are deep accent with pale accent ink.
export const accentPalette = (
	color: string | null,
	dark: boolean,
): Record<string, string> | null => {
	if (color === null) return null;
	const { C, H } = linearToOklch(hexToLinear(color));
	const strength = strengthOf(C);
	const palette: Record<string, string> = {
		"--color-white": dark
			? oklchHex(0.94, 0.04 * strength, H)
			: inkOf(color),
		"--color-black": dark
			? oklchHex(0.2, 0.045 * strength, H)
			: oklchHex(0.3, 0.1 * strength, H),
	};
	const lightness = NEUTRAL_L(dark);
	NEUTRAL_STEPS.forEach((step, index) => {
		palette[`--color-neutral-${step}`] = oklchHex(
			lightness[index],
			NEUTRAL_C[index] * strength,
			H,
		);
	});
	return palette;
};

export const PALETTE_VARIABLES = [
	"--color-white",
	"--color-black",
	...NEUTRAL_STEPS.map((step) => `--color-neutral-${step}`),
];
