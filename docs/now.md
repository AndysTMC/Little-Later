---
type: now
updated: 2026-11-23
horizon: 2026-11-23 → 2026-12-07
---

# Now

## Focus

Preparing the `3.2.0` release on `dev`: desktop CLI quick-capture and upgraded `little-later-mcp` Native Messaging distribution (#72, #73), portable Markdown/iCalendar/Bookmarks exports and bookmark HTML import (#73), encrypted offline article snapshots (#73), and an exhaustive UI/security/reliability polish pass (#74) covering Little AI header/chats swap, `task.label` UI retirement in favor of `#tags`, 320px side-panel density, readable-export/context-menu hardening, and sharded CI.

## Next

- Merge `chore/release-3.2.0` into `dev`, cut the `dev` → `main` release PR, and tag `v3.2.0`.
- Publish `little-later-mcp@3.2.0` to public npm.
- Review and decide whether to mark proposed decisions `0008`, `0009`, and `0013`–`0018` as `accepted` (with the `human-accepted` PR label).
- Recompute floating schedules when a page opens; the alarm, start-up, idle and after-command triggers from decision 0011 are in place.

## Blocked

Nothing.

## Do not do

- Merge into `main` or tag a release before the version is approved.
- Mark a decision `accepted` without a named human deciding it.
