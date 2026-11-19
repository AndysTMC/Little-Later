import { afterEach, describe, expect, it } from "vitest";
import { LTHEME } from "little-shared/enums";
import { accentColorOf, accentPalette, inkOf } from "../../src/appearance";
import {
	DEFAULT_LOOK,
	paintRoot,
	readLookHint,
	writeLookHint,
} from "../../src/popup/themeHint";

afterEach(() => {
	document.getElementById("root")?.remove();
	document.documentElement.removeAttribute("style");
	localStorage.clear();
});

const root = () => {
	const element = document.createElement("div");
	element.id = "root";
	document.body.append(element);
	return element;
};

const page = () => document.documentElement.style;

describe("the popup's look", () => {
	it("paints the accent, the ink on it, and the palette it tints", () => {
		const element = root();
		paintRoot({ theme: LTHEME.DARK, accent: "blue", accentColor: null });
		expect(element.classList.contains("bg-black")).toBe(true);
		const blue = accentColorOf("blue", null)!;
		expect(element.style.getPropertyValue("--ll-accent")).toBe(blue);
		expect(element.style.getPropertyValue("--ll-accent-ink")).toBe(
			inkOf(blue),
		);
		expect(page().getPropertyValue("--color-black")).toBe(
			accentPalette(blue, true)!["--color-black"],
		);
		expect(page().getPropertyValue("--color-neutral-500")).toBe(
			accentPalette(blue, true)!["--color-neutral-500"],
		);
	});

	// Mono is the theme's own foreground, so it follows light and dark, and
	// leaves the palette plain.
	it("uses the theme's colours for Mono", () => {
		const element = root();
		paintRoot({ theme: LTHEME.DARK, accent: "pink", accentColor: null });
		paintRoot({ theme: LTHEME.LIGHT, accent: "mono", accentColor: null });
		expect(element.style.getPropertyValue("--ll-accent")).toBe(
			"var(--ll-fg)",
		);
		expect(element.style.getPropertyValue("--ll-accent-ink")).toBe(
			"var(--ll-bg)",
		);
		expect(page().getPropertyValue("--color-black")).toBe("");
		expect(page().getPropertyValue("--color-white")).toBe("");
	});

	it("remembers the last look, and ignores a damaged one", () => {
		writeLookHint({
			theme: LTHEME.DARK,
			accent: "pink",
			accentColor: null,
		});
		expect(readLookHint()).toEqual({
			theme: LTHEME.DARK,
			accent: "pink",
			accentColor: null,
		});
		localStorage.setItem("little.lookHint", '{"accent":"neon"');
		expect(readLookHint()).toEqual(DEFAULT_LOOK);
	});
});
