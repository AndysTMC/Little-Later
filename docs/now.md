---
type: now
updated: 2026-11-22
horizon: 2026-11-22 → 2026-12-06
---

# Now

## Focus

Major feature and hardening work landed on `dev` (#67): LittleAI side panel with worker runs, model search, hybrid retrieval, and loopback MCP; encrypted Images vault (Dexie v3); password-locked notes; cross-record `#tags`; passkey/security-key two-factor unlock; unified design language with accent theming; and Data & Privacy / AI Settings reorganisation. Preparing the next release from `dev` to `main` once open dependency updates and docs land.

## Next

- Cut the next release PR (`dev` → `main`) with version bump (`manifest.json`, `package.json`, `packages/shared/package.json`) and `CHANGELOG.md` release heading.
- Review and decide whether to mark proposed decisions `0008`, `0009`, and `0013`–`0018` as `accepted` (with the `human-accepted` PR label).
- Recompute floating schedules when a page opens; the alarm, start-up, idle and after-command triggers from decision 0011 are in place.

## Blocked

Nothing.

## Do not do

- Merge into `main` or tag a release before the version is approved.
- Mark a decision `accepted` without a named human deciding it.
