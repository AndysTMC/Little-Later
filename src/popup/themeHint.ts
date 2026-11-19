import { LTHEME } from "little-shared/enums";
import {
	DEFAULT_ACCENT,
	PALETTE_VARIABLES,
	accentColorOf,
	accentPalette,
	inkOf,
	isAccent,
	isAccentColor,
	type Accent,
} from "../appearance";

// How the popup last looked, kept in the popup's own storage so the next
// opening paints that way at once. The profile's own preferences are only
// known once its row has loaded; until then a dark profile flashed white.
// A display hint only: it holds no profile data.

export type Look = {
	theme: LTHEME;
	accent: Accent;
	// The Custom accent's colour, if the profile chose one.
	accentColor: string | null;
};

const KEY = "little.lookHint";

export const DEFAULT_LOOK: Look = {
	theme: LTHEME.LIGHT,
	accent: DEFAULT_ACCENT,
	accentColor: null,
};

export const readLookHint = (): Look => {
	try {
		const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<
			Record<keyof Look, unknown>
		>;
		return {
			theme: stored.theme === LTHEME.DARK ? LTHEME.DARK : LTHEME.LIGHT,
			accent: isAccent(stored.accent) ? stored.accent : DEFAULT_ACCENT,
			accentColor: isAccentColor(stored.accentColor)
				? stored.accentColor
				: null,
		};
	} catch {
		return DEFAULT_LOOK;
	}
};

export const writeLookHint = (look: Look): void => {
	try {
		localStorage.setItem(KEY, JSON.stringify(look));
	} catch {
		// Storage may be unavailable; the next opening starts plain.
	}
};

// The page's background and accent, on the root elements. The accent's
// palette replaces the colours every class is drawn in (accentPalette);
// `--ll-accent` is what highlights are drawn in and `--ll-accent-ink` what
// goes on top of it (src/popup/index.css).
export const paintRoot = (look: Look): void => {
	const root = document.getElementById("root");
	const dark = look.theme === LTHEME.DARK;
	root?.classList.toggle("bg-black", dark);
	root?.classList.toggle("bg-white", !dark);
	const color = accentColorOf(look.accent, look.accentColor);
	root?.style.setProperty("--ll-accent", color ?? "var(--ll-fg)");
	root?.style.setProperty(
		"--ll-accent-ink",
		color ? inkOf(color) : "var(--ll-bg)",
	);
	const page = document.documentElement.style;
	const palette = accentPalette(color, dark);
	for (const name of PALETTE_VARIABLES) {
		if (palette) {
			page.setProperty(name, palette[name]);
		} else {
			page.removeProperty(name);
		}
	}
};
