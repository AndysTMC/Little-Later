---
type: belief
---

# Design rules

How Little Later's popup looks and behaves. New screens reuse these parts; a new pattern needs a reason the existing ones cannot meet, recorded here. Components live in `src/popup/components/`.

## Pages

There are three page layouts. Every page starts with `LUIBasicNav` (logo, and Back where there is somewhere to go back to).

| Layout                             | Used for                                              | Parts                                                                       |
| ---------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| Settings (`LUISettingsLayout`)     | Settings and its pages, Profile, Export               | Title on a framed box, rows inside, notes below the rows                    |
| Identity (`LUIIdentityPage`)       | Unlock, Lock, the password, two-factor unlock changes | Centred title, the profile's photo, one column of `w-72` fields and buttons |
| Record (`LUIFeaturePageUD` header) | Notes, tasks, reminders, saves, and Home's panels     | The record's icon on a line, then its form or list                          |

Titles are `text-4xl font-semibold`. A column scrolls rather than squeezing what it holds.

## Rows

- `LUISettingLink` opens a page: the label, and an arrow that slides in on hover. The Settings page gives its rows icons; other lists don't. A list's rows either all have an icon or none do.
- `LUISettingSelect` is a setting with a few choices: its name, and the app's dropdown (`LUISelectT2`), never the native one.
- `LUINumInput` is a number with a stepper.
- Labels are plain: no "on"/"off" suffixes. What a row leads to says its state.

## Buttons

`LUICUButton` is the one action button.

- **primary**: the caret block in the accent, then the label. One per view.
- **secondary**: outlined, label only, for the other ways out (Cancel, Delete on the lock screen, a recovery code instead of the key).
- **danger**: red, label only, for the second press of something that cannot be undone ("Confirm delete", "Remove password").

The button blocks a second press while its action runs and shows a spinner when it is slow, so pages don't keep their own "in progress" state for it.

- Small pills (`text-xs`, `rounded-full`) are for actions inside a card, such as Collapse.
- An AI suggestion inside a form (Rephrase, Generate label) uses `LUIAIButton`.
- The intro's and Getting Started's Skip is a neutral `rounded-md` button.
- Text links are not used for actions.

## Fields

- **Label-tab field** (`LUITextInputT1`, `LUITextArea`): record and settings forms. The label sits on the field once it has a value.
- **Icon field** (`LUIIconField`): identity screens only (unlock, new profile, password, two-factor unlock, import).

Both use `rounded-lg`, a `neutral-300` border (`neutral-700` in dark), the same placeholder colours, and the same focus ring.

## Confirming

- **Deleting a list item** (note, task, reminder, save, history entry): `LUIDeleteButton`. It is a "Delete" pill with no icon. The first press arms it, red and reading "Confirm delete", for four seconds; the second press deletes.
- **Something that needs the password** (deleting a profile, turning off two-factor unlock, removing a key): an identity screen. It holds the password field and the action button, with the destructive step on the danger button.
- There are no browser dialogs (`confirm()`), and no second confirmation after the password.

## Notes and messages

- `LUINote`: an icon and quiet italic text, below the rows or beside the form it explains. A warning uses the warning icon and is announced as an alert.
- Toasts (`createToast`) report the outcome of an action that leaves the page, such as "Export started." or "Security key added."

## Colour

- Colours come from the palette: Tailwind's `black`, `white` and `neutral-*`, which the accent redefines (decision 0016), and `--ll-accent` for highlights (`.ll-accent-fill`).
- A component never names a hex colour or `rgb()`. The only exceptions are the accent swatches, which show the colours they choose.
- Red (`red-600`) is for danger only.
- Icons take their colour from the theme (`LUIThemedIcon`).

## Focus

- Fields and dropdowns show focus as one accent ring on their own edge.
- Buttons, rows and swatches show it outside their edge.
- The text caret is the accent.

## Motion

- Every navigation carries one move (`src/route-transitions.ts`): forward and back between pages, into and out of a profile, rise and sink for Home's panels.
- Motion respects reduced motion.

## Windows

A security key's prompt closes the toolbar popup, so a passkey or security key ceremony started there continues in a small window. That window shows the same page at the popup's size (`src/popup/ceremonyWindow.ts`).
