---
type: belief
---

# Design rules

How Little Later looks and behaves across the popup, full-extension side panel, and Little AI. New screens reuse these parts; a new pattern needs a reason the existing ones cannot meet, recorded here. Components live in `src/popup/components/`.

## Geometry & surfaces

Three radius tiers govern every element:

- **`rounded-2xl` (16px):** All cards and containers (saves, tasks, reminders, notes, history entries, settings frame, Little AI cards, composer, ask box). Cards keep the same shape when collapsed and expanded.
- **`rounded-xl` (12px):** All interactive rectangles (action buttons, search bar, fields, textareas, dropdowns, segmented controls, number steppers, preview thumbnails, toasts, menus).
- **`rounded-full`:** Circular icon-only controls, avatars, and status/label chips.

Structural borders use `neutral-800` in dark (`neutral-200` in light); control borders use `neutral-700` (`neutral-300` in light). Card surfaces use `neutral-900/70` (`neutral-100/70` in light). High-contrast `border-white`/`border-black` frames are not used.

## Pages

There are four page layouts. Popup and side-panel pages start with `LUIBasicNav` (`← Back` on the left where there is somewhere to go back to, logo on the right). Standalone Little AI has its own header (`src/panel/`).

| Layout                             | Used for                                                                        | Parts                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings (`LUISettingsLayout`)     | Settings and its pages (including the modular AI Settings hub), Profile, Export | `text-2xl` title above a `rounded-2xl` surface card holding rows and notes                                                                         |
| Identity (`LUIIdentityPage`)       | Unlock, Lock, the password, two-factor unlock changes                           | Centred `text-2xl` title, `size-24` avatar, one column of responsive `max-w-72` fields and buttons                                                 |
| Record (`LUIFeaturePageUD` header) | Notes, tasks, reminders, saves, and Home's panels                               | Compact icon + title pill on a hairline divider, then its form or list                                                                             |
| Little AI (`src/panel/`)           | The side panel, `/ai`, and the same page in a tab                               | A header (Back when inline, chats, logo, title, new chat), the conversation, and the composer with in-chat searchable model switcher at the bottom |

Titles are `text-2xl font-semibold tracking-tight`. Every scrollable region uses Little Later's themed scrollbar (configured globally on `#root`), never Chrome's native scrollbar.

## Record cards

Saves, tasks, reminders, notes, and history entries share one `rounded-2xl` card grammar:

- **Tasks (`LUITaskMini`):** Circular checkbox (`CheckIcon`, filled in `--ll-accent` when done) on the left in both states; title, priority/legacy-label chip, schedule, and tag chips visible when collapsed; quiet Edit icon + chevron on the right; hairline-divided expanded drawer with links and actions.
- **Reminders (`LUIReminderMini`):** Message visible on the primary line when collapsed, with target time, kind badge, and tag chips underneath; clickable card / Details toggle + quiet Edit icon; hairline-divided expanded drawer with links and Delete.
- **Saves (`LUIVBMs` / `LUIVBMMini`):** Thumbnail + title + domain + tag chips + link counts when collapsed; `Active | Archived` filter when archived saves exist; hairline-divided expanded drawer with full preview (`Open page`, `View image`), links, `Archive`/`Unarchive`, and actions.
- **Notes (`LUINotes` / `LUINoteMini`):** Clean single-column list (upgrading to a left-to-right 2-column grid on wide viewports) with `All | Locked` filter when locked notes exist; creating a new note lives in the bottom navigation bar (`History | New task | New reminder | New note`). Locked notes show only a lock badge, optional visible title, tags, and date until unlocked with the profile password, and re-lock on leave.
- **Images (`LUIImages` / `/image/:id`):** Responsive 2-column encrypted thumbnail grid with `+ Add image` routing through the shared `/pick-file` screen and a detail viewer for title, tags, source URL, download, and delete.
- **Tags (`LUITagChips` / `LUITagInput`):** Shared `#tag` pills across saves, tasks, reminders, notes, and images; clicking any tag chip searches `#tag` in Home Search, and `LUITagInput` suggests matching existing tags while typing.
- **History (`LUIBrowsedVBM`):** Same card surface, concise timestamp (`relative · date`), uniform row of `rounded-lg` icon buttons + unified Delete.

## Rows

- `LUISettingLink` opens a page: `rounded-xl` hover row, regular-weight icon, label, and subtle right caret. Rows in one list either all have an icon or none do.
- `LUISettingSelect` is a setting with a few choices: its name, and the app's dropdown (`LUISelectT2`, `rounded-xl`), never the native one.
- `LUINumInput` is a `[ - | value | + ]` number stepper (`rounded-xl`, `h-9`).
- `LUISelectT1` is a segmented control (`role="radiogroup"`) showing all options side-by-side inside a `rounded-xl` track, active choice filled in `--ll-accent`.
- Labels are plain, in Sentence case, with no "on"/"off" suffixes.

## Buttons

`LUICUButton` is the one full-width action button (`h-11`, `max-w-72`, `rounded-xl`):

- **primary:** solid `--ll-accent` fill, label only. One per view.
- **secondary:** outlined (`neutral-700`/`neutral-300`), label only, for secondary paths (Cancel, Delete on lock/unlock, recovery code).
- **danger:** solid `red-600`, label only, for the second press of something that cannot be undone ("Confirm delete", "Remove password").

The button blocks a second press while its action runs and shows a spinner when it is slow.

- Compact card actions (`LUIPillButton`) are `rounded-lg` with a calm neutral surface (never harsh inverted black/white).
- An AI suggestion inside a form (Rephrase) uses `LUIAIButton` (`rounded-xl`).
- Text links are not used for actions.

## Fields

- **Form fields** (`LUITextInputT1`, `LUITextArea`): compact top label + optional right-aligned counter, `rounded-xl` border, red inline error text (`text-red-500`).
- **Icon field** (`LUIIconField`): identity screens only (unlock, new profile, password, two-factor unlock, import), `h-11 max-w-72 rounded-xl`, regular-weight icon.

## Confirming & deleting

- **Deleting a record** (note, task, reminder, save, history entry, Little AI chat): `LUIDeleteButton` — a quiet ghost `"Delete"` text button with no icon that arms to solid red `"Confirm delete"` for four seconds; the second press deletes.
- **Detaching / removing from a list** (unlinking a save, removing a staged file): quiet ghost `XIcon` (`LUIUnlinker`, `LUIFileInput`), never `TrashIcon`.
- **Something that needs the password** (deleting a profile, turning off two-factor unlock, removing a key): an identity screen with a `danger` button.
- No browser dialogs (`confirm()`).

## Notes, toasts, tooltips & primitives

- `LUINote`: an icon and quiet italic text below the rows or form it explains. A warning uses the warning icon and `role="alert"`.
- `LUITooltip`: portal-rendered, viewport-clamped tooltip (`role="tooltip"` + `aria-describedby`). Appears only on icon-only, collapsed, or disabled controls where a short hint prevents confusion without clutter (never redundantly on buttons whose label is already visible). Opens after a `350ms` hover intent delay, opens immediately on keyboard focus, stays open while hovered or focused (WCAG 2.2), keeps a stable trigger mount across disabled-state transitions so keyboard focus is never dropped, and dismisses immediately on pointer press, Escape, scroll, or blur.
- `LUIBadge`: standardized `rounded-full` status/metadata chip (`neutral`, `accent`, `muted`, `danger` tones; `xs` and `sm` sizes; optional leading icon).
- `LUISectionHeader`: standardized section title with optional description and right-aligned action or count slot.
- Toasts (`LUIToast`): responsive `w-[min(22rem,calc(100vw-2rem))] rounded-xl border shadow-lg` with semantic icon tint.
- Icons: Phosphor icons throughout (`regular` weight for resting UI controls, `fill` for active/status states), tinted via `LUIThemedIcon`.

## Colour

- Colours come from the palette: Tailwind's `black`, `white` and `neutral-*`, which the accent redefines (decision 0016), and `--ll-accent` for primary actions and active selection (`.ll-accent-fill`).
- A component never names a hex colour or `rgb()` (except accent swatches).
- Red (`red-600`/`red-500`) is for danger and errors only.

## Focus & motion

- Fields and dropdowns show focus as one accent ring on their own edge; buttons, rows and swatches show it outside their edge; the text caret is the accent.
- Interactive icon controls and pills use `150ms` transitions and subtle tactile press feedback (`active:scale-95`).
- Navigation carries symmetric directional moves (`src/route-transitions.ts`: `240ms` quint-out enter, `160ms` smooth exit, `±24px` slide or `0.96 ↔ 1.04` zoom); tabs, card drawers, popovers, sheets, content reveals, and toasts share the centralized `MOTION` timing tokens so motion feels balanced and consistent across both the extension and Little AI. All transitions and animations respect `prefers-reduced-motion`.

## Little AI

Little AI (`src/panel/`) shares the same palette, surfaces, focus ring, GFM markdown rendering, and unified `LUIDeleteButton` in chat history. Its compact controls (`src/panel/ui.tsx`) suit a denser chat layout while matching Little Later's identity (`LUILogo` / Back nav, `rounded-2xl` cards, accent Send button, docked `AskBox` for questions and confirmations).

## Windows & surfaces

- **Side panel modes** (`Settings → Misc → Side panel`): `Everything` (full extension in Chrome's side panel, `/ai` inline, file upload supports both paste/drop and browsing), `AI only` (default: popup + standalone `sidepanel.html`), or `None` (popup only, `/ai` inline).
- **Responsive sizing:** All surfaces adapt cleanly from narrow side panels (~320px) through the toolbar popup (500px) to wide side panels and full browser tabs (`max-w-2xl`/`max-w-3xl` centered content rails inside edge-to-edge scroll containers, responsive thumbnails and dropdown widths, vertical stacking for multi-option recurrence controls, and `min-[560px]:grid-cols-2` for Notes).
- A security key's prompt closes the toolbar popup, so a ceremony started there continues in a small window (`src/popup/ceremonyWindow.ts`). In the side panel or a tab, ceremonies run in place.
