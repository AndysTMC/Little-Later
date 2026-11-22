---
type: decision
---

# 0016. A profile's accent colours the whole popup

Status: proposed
Date: 2026-11-19
Deciders: AndysTMC
Supersedes: —
Superseded-by: —

## Context

Each profile could pick an accent, but it only reached highlights: the active tab, focus outlines and the main buttons. Everything else stayed black and white. The popup is built with Tailwind classes that name fixed colours (`bg-black`, `text-white`, `border-neutral-300`), spread across about a hundred components, so recolouring them one by one would not stay consistent.

A text-size preference was added alongside the accent and then dropped: the popup is a fixed 500×600 box, so larger text only crowded it.

## Options

- A. Keep the accent for highlights only.
- B. Add accent variants of every colour class, component by component.
- C. Redefine the colours the classes are drawn in. Tailwind 4 draws every colour class from a CSS variable (`--color-black`, `--color-white`, `--color-neutral-50` … `-950`), so setting those variables on the page tints every class at once.

## Decision

Option C.

- **Palette:** `accentPalette` (`src/appearance.ts`) builds Tailwind's black, white and neutral scale from the accent's hue in OKLCH. Each step keeps Tailwind's lightness, so contrast stays where it was, and takes a share of the accent's chroma. Light pages are a pale wash with dark accent ink; dark pages are a deep accent with pale accent ink. Mono keeps the plain palette.
- **Highlights:** `--ll-accent` is the accent itself, darkened if needed (`highlightOf`) so its ink, the accent's palest tint, reads on it at 4.5:1.
- **Choices:** a standard set (Mono, Red, Orange, Amber, Green, Teal, Blue, Indigo, Purple, Pink) and Custom, set with hue and strength dials or typed as `#rrggbb`. Any custom colour works, because the highlight and palette are derived from it.
- **Storage:** plain profile preferences beside the theme (`prefs.accent`, `prefs.accentColor`), like the name and photo, so the locked worker and the unlock screen can read them. Backups carry them.
- **Where it shows:** every unlocked page, and a profile's own unlock screen. The profile picker stays plain, since it lists several profiles.
- **What stays fixed:** danger red, and the Mono swatch itself.
- **No "follow Chrome" choice:** an extension page cannot read Chrome's theme colour. The CSS `AccentColor` keyword returns a fixed blue outside installed web apps, so it is not offered.

## Trade-offs against the charter

- **Accessibility:** `tests/popup/accent-palette.test.ts` checks every text pair that met 4.5:1 (or 3:1) in plain black and white still meets it under every standard accent and a spread of custom colours, in both themes.
- **Consistency:** colours named outside the classes (an icon's `fill="white"`, the scrollbars, the loading squares, image placeholders) are drawn from the same variables, so no part stays black and white.
- **Complexity:** one module of colour arithmetic, with no new dependency.

## Assumptions

- Tailwind 4 continues to back `black`, `white`, and `neutral-*` utilities with `--color-*` CSS custom properties on `:root`.
- OKLCH lightness preservation keeps contrast ratios within WCAG AA across the full hue range.

## Rollback

Choosing Mono restores the plain palette. Removing the feature means removing the variables `paintRoot` sets; the classes fall back to Tailwind's own colours.

## How to verify

- `tests/popup/accent-palette.test.ts` and `tests/popup/appearance.test.ts`.
- `tests/extension/settings.ext.ts`: choosing Green tints the page and its text, survives reopening, and Mono restores black and white.
- The screenshot tour (`bun run screenshots`) captures every screen under Green, and under a custom colour in the dark theme.

## Revisit if

Chrome gives extensions its theme colour, or a contrast check fails for a colour people use.
