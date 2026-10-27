# 0007. Close the P0 security gaps before the core rebuild

Status: proposed
Date: 2026-10-27
Deciders: AndysTMC (plan approved 2026-10-27)
Supersedes: —
Superseded-by: —

## Context

The October 2026 review (plan doc, section 4) verified six gaps that put user data or privacy at risk whatever the later core rebuild does. Each is small, and each is fixed here without changing a stored format.

| ID  | Problem                                                                                                                                                                   | Evidence                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A3  | The dynamic DNR rule that sets `Origin: http://127.0.0.1` on requests to local AI ports has no initiator filter, so any website's requests get the same header            | `src/background/background.ts:84-107`; reproduced in Chromium, and the fix verified with the same harness        |
| A8  | Prompt-injection exfiltration: note text is sent as a `system` message, model-supplied remote images load automatically, and the confirmation card renders model Markdown | `src/services/ai/main.ts:472-525`, `src/popup/components/LUIAIAssistMain/Component.tsx:59-92,547-563`            |
| A1  | Locking re-encrypts the vault with whatever is typed; a typo locks the profile for good, and an empty box silently removes the password                                   | `src/popup/components/LUIAuthGate/Component.tsx:44-135`, `src/services/user.ts:262-334`                          |
| A14 | A locked profile can be deleted without its password                                                                                                                      | `LUIAuthGate/Component.tsx:77-96`, `src/services/user.ts:137`                                                    |
| A16 | An imported backup carries AI settings, so it can point the AI client at any endpoint; a remote `http://` endpoint is accepted silently                                   | `src/services/dataExchange.ts:260-352`, `src/services/user.ts:190-241`, `src/popup/pages/LUIAISettings/Page.tsx` |
| A26 | Preview and avatar blobs keep whatever MIME type the vault says; a `text/html` one opened with "Open image" renders as a page in the extension origin                     | `packages/shared/src/utils/crypto.ts:180-186`, `src/popup/components/LUIWebPreview/Component.tsx:26-29`          |

## Options

- A. Do nothing until the core rebuild. Zero churn, but the gaps stay open for weeks, and A3 and A8 affect anyone running the repo today.
- B. Fix each gap at the narrowest point in today's code, with tests, and keep the fixes when the rebuild lands (the rebuild changes storage and the AI core, not these boundaries).
- C. Wait and fix inside the rebuild only, so nothing is written twice. Same exposure as A, and the rebuild gets bigger and harder to review.
- D. Disable the risky features (local-AI header rewrite, AI chat, import) until the rebuild. Safe, but removes core user value.

## Decision

Option B, one commit per gap, revised after an independent review (below):

1. **A3:** add `initiatorDomains: [chrome.runtime.id]` to the rule, so only the extension's own requests get the header; `[::1]` counts as a local host.
2. **A8:**
    - Remote images never load inside the extension. One Markdown policy (`src/popup/markdownSafety.tsx`) renders only relative, same-extension, `blob:` and raster `data:` images, in the AI chat, note views and save cards; anything else becomes a link that shows its host. It is enforced in the renderer, so reference-style, titled and nested-alt images are covered, not only what a regex finds.
    - The extension-page CSP adds `img-src 'self' blob: data:` as a second layer, keeping Chrome's default `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`.
    - A confirmation turn renders the model's message as plain text.
    - Links open in a new tab with `noopener` and show their host. A link still needs a click to leak anything, which we accept.
    - Prefetched notes travel as quoted JSON inside the user's own turn, not as a `system` message. This is hygiene: injection also works from the user role, and the output rules above are the actual defence.
    - Website-controlled save titles are escaped before they go into Markdown.
3. **A1:** the lock screen checks the typed password once on Go. The current password locks at once. A new one must be typed twice. An empty one on a protected profile needs an explicit "Remove password and lock" press. The reserved `EMPTY_PASSWORD` sentinel and passwords with leading or trailing spaces (which backups trim) are refused, in the UI and in `lockUser`. A profile with no vault row yet is treated as having no password. The per-keystroke decrypt that showed "old" or "new" is removed.
4. **A14:** `deleteUser` takes the password and verifies it in the service layer; the screen asks for the current password in a field of its own, because on the lock screen the main field means "new password". This guards against casual or accidental deletion, not a determined attacker: removing the extension or using DevTools still wipes the data.
5. **A16:** importing a backup resets its AI provider, base URL, API key and model to defaults before the vault is stored (decrypt once, reset, re-encrypt with the same password). Every caller of `getResolvedBaseUrl` refuses a plain `http://` custom URL unless the host is loopback, and the settings page says why. The realistic threat is small (the user must import someone else's file with that person's password), but the fix is cheap.
6. **A26:** object URLs for previews and avatars are made only from raster image types (`image/jpeg`, `png`, `webp`, `gif`); anything else gets `application/octet-stream`, which `<img>` still decodes (checked in Chromium) but a top-level navigation downloads instead of rendering.

## Trade-offs against the charter

- Security and privacy (Critical) improve directly; nothing else gets worse except as listed here.
- **Product:** remote images no longer load inside the extension; in the AI chat, notes and save cards they show as links with their host.
- **Product:** SVG avatars no longer display, since `<img>` does not sniff SVG from opaque bytes. The avatar picker should restrict itself to raster types in the design-system phase.
- **Product:** a restored backup needs its AI endpoint and key entered again.
- **Performance:** import holds the vault in memory a few more times (about 400 to 450 MB peak for a 64 MB vault, estimated) and runs one more key derivation. Acceptable for a rare action; the core rebuild replaces this path.
- **Usability:** setting a new lock password takes one more field, and deleting takes the current password; both are standard patterns.
- **Maintainability:** about 600 changed lines including tests, mostly in files the rebuild restructures; the fixes sit at boundaries the rebuild keeps.
- **Oracle:** checking the typed password on Go costs one full key derivation; anyone with an unlocked session could copy the vault and guess offline anyway, so this adds no new exposure.

## Rollback

Each gap is its own commit, so `git revert` of that commit restores the previous behaviour. No stored format changes, so a rollback cannot strand data. One exception: reverting A16 does not bring back AI settings already stripped from vaults imported in the meantime, which is harmless.

## How to verify

- Unit tests for each boundary: rule shape (A3), note context role and image URL policy (A8), lock decision table (A1), delete with a wrong password (A14), imported AI settings and URL validation (A16), and safe blob types (A26).
- Full suite, typecheck, lint and build after each commit.
- Rerun the A3 Chromium harness from the review against the built extension.

## Assumptions

- [A1] `initiatorDomains` with the extension ID matches requests from the popup and the service worker. Verified on the built extension in Chromium: the popup's and the worker's requests get the header, a website's request keeps its own origin.
- [A2] Chrome's `<img>` decodes a raster image from an object URL typed `application/octet-stream`. Verified in Chromium.

## Review

An independent agent critiqued the first draft. Adopted: enforce the image policy in the renderer rather than a regex; keep notes inside the user's turn instead of a separate message (consecutive user turns break some local chat templates); refuse the sentinel and outer-space passwords and handle a missing vault; a separate password field for delete; restrict `chrome-extension://` images to this extension; escape save titles; spell out the full CSP; IPv6 loopback in the Origin rule; and the corrected trade-offs above. Not adopted yet: the AI settings page still fetches the model list (with the API key) while a URL is being typed, so a mistyped https host can receive the key. That belongs to the AI settings rework.

## Revisit if

The core rebuild moves AI calls or previews behind a different boundary, or the product wants remote images in notes back (then load them through an explicit per-note "load images" choice).
