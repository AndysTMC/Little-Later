import { describe, expect, it } from "vitest";
import {
	ACCENTS,
	NEUTRAL_STEPS,
	accentColorOf,
	accentPalette,
	colorFromDials,
	contrast,
	highlightOf,
	inkOf,
	type Accent,
} from "../../src/appearance";

// The accent tints the whole popup, text included. Whatever text was
// readable in plain black and white must stay readable in every accent:
// each pair that met WCAG's 4.5:1 (text) or 3:1 (large text, lines) in
// Mono meets it tinted.

const PLAIN: Record<string, string> = {
	"--color-white": "#ffffff",
	"--color-black": "#000000",
	"--color-neutral-50": "#fafafa",
	"--color-neutral-100": "#f5f5f5",
	"--color-neutral-200": "#e5e5e5",
	"--color-neutral-300": "#d4d4d4",
	"--color-neutral-400": "#a3a3a3",
	"--color-neutral-500": "#737373",
	"--color-neutral-600": "#525252",
	"--color-neutral-700": "#404040",
	"--color-neutral-800": "#262626",
	"--color-neutral-900": "#171717",
	"--color-neutral-950": "#0a0a0a",
};

const names = Object.keys(PLAIN);
// The surfaces text sits on: the page, and the quiet fills on it.
const SURFACES = {
	light: ["--color-white", "--color-neutral-50", "--color-neutral-100"],
	dark: ["--color-black", "--color-neutral-950", "--color-neutral-900"],
};

// Every standard accent, and Custom colours across the dials: pale,
// strong, every side of the hue circle, and a near-black and a near-white
// typed in.
const COLORS: Array<[string, string]> = [
	...(Object.keys(ACCENTS) as Array<Accent>)
		.filter((accent) => ACCENTS[accent].color !== null)
		.map((accent): [string, string] => [
			accent,
			accentColorOf(accent, null)!,
		]),
	...[0, 60, 120, 180, 240, 300].flatMap((hue) =>
		[10, 60, 100].map((strength): [string, string] => [
			`custom ${hue}/${strength}`,
			colorFromDials(hue, strength),
		]),
	),
	["custom #fafafa", highlightOf("#fafafa")],
	["custom #ffff00", highlightOf("#ffff00")],
	["custom #050505", highlightOf("#050505")],
];

describe("the accent palette", () => {
	it("leaves Mono plain", () => {
		expect(accentColorOf("mono", null)).toBeNull();
		expect(accentPalette(null, false)).toBeNull();
		expect(accentPalette(null, true)).toBeNull();
	});

	// Highlights carry text: the active tab, the main buttons. It is the
	// accent's palest tint, not pure white.
	it("reads the ink on every highlight", () => {
		for (const [, color] of COLORS) {
			expect(inkOf(color)).not.toBe("#ffffff");
			expect(contrast(color, inkOf(color))).toBeGreaterThanOrEqual(4.5);
		}
	});

	for (const [name, color] of COLORS) {
		for (const dark of [false, true]) {
			it(`keeps text readable in ${name}, ${dark ? "dark" : "light"}`, () => {
				const palette = accentPalette(color, dark)!;
				expect(Object.keys(palette).sort()).toEqual([...names].sort());
				const problems: Array<string> = [];
				for (const surface of SURFACES[dark ? "dark" : "light"]) {
					for (const text of names) {
						const before = contrast(PLAIN[text], PLAIN[surface]);
						const after = contrast(palette[text], palette[surface]);
						for (const floor of [4.5, 3]) {
							if (before >= floor && after < floor) {
								problems.push(
									`${text} on ${surface}: ${after.toFixed(2)} < ${floor}`,
								);
								break;
							}
						}
					}
				}
				expect(problems).toEqual([]);
			});
		}
	}

	it("is visibly the accent", () => {
		for (const accent of ["red", "green", "blue", "pink"] as const) {
			const light = accentPalette(accentColorOf(accent, null), false)!;
			expect(light["--color-black"]).not.toBe("#000000");
			expect(light["--color-white"]).not.toBe("#ffffff");
		}
		expect(NEUTRAL_STEPS).toHaveLength(11);
	});
});
