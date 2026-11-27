---
type: now
updated: 2026-11-27
horizon: 2026-11-27 → 2026-12-11
---

# Now

## Focus

Preparing the `3.3.0` release on `dev`: security hardening pass (#82), full UI parity for the external `little-later-mcp` bridge and CLI with explicit history/delete opt-in grants (#83), modular AI Settings hub and multi-server local MCP client (#84), shared design-system primitives (`LUITooltip`, `LUIBadge`, `LUISectionHeader`) and unified smooth motion/transitions (#85), and trimmed GitHub Release assets (#86).

## Next

- Merge `chore/release-3.3.0` into `dev`, cut the `dev` → `main` release PR, and tag `v3.3.0`.
- Publish `little-later-mcp@3.3.0` to public npm.
- Review and decide whether to mark proposed decisions `0008`, `0009`, and `0013`–`0018` as `accepted` (with the `human-accepted` PR label).
- Recompute floating schedules when a page opens; the alarm, start-up, idle and after-command triggers from decision 0011 are in place.

## Blocked

Nothing.

## Do not do

- Merge into `main` or tag a release before the version is approved.
- Mark a decision `accepted` without a named human deciding it.
