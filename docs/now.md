---
type: now
updated: 2026-11-27
horizon: 2026-11-27 → 2026-12-11
---

# Now

## Focus

Shipping patch `3.3.1` on `dev`: fixing Home tab bar width overflow during tab switches, tuning route and UI animations to a balanced standard speed, and stabilizing layout height and scrollbar gutter on the AI Provider & Model settings screen.

## Next

- Merge `fix/ui-polish-3.3.1` into `dev`, sync `main` (`7cec8d0`) into `dev` if needed, cut `dev` → `main` for `v3.3.1`, and tag `v3.3.1`.
- Review and decide whether to mark proposed decisions `0008`, `0009`, and `0013`–`0018` as `accepted` (with the `human-accepted` PR label).
- Recompute floating schedules when a page opens; the alarm, start-up, idle and after-command triggers from decision 0011 are in place.

## Blocked

Nothing.

## Do not do

- Merge into `main` or tag a release before the version is approved.
- Mark a decision `accepted` without a named human deciding it.
