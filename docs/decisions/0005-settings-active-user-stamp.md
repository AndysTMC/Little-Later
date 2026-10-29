---
type: decision
---

# 0005. Settings stay in `chrome.storage.local` with a fail-closed `activeUserId` stamp

Status: superseded by 0010
Date: 2026-08-19
Deciders: existing project
Supersedes: —
Superseded-by: 0010

## Context

Theme and AI provider settings are not stored in the Dexie vault tables. They live in `chrome.storage.local` (or the dev `localStorage` fallback). Without a session stamp, settings from one profile can apply after lock or switch.

## Options

- A. Keep settings in `chrome.storage` and stamp them with `activeUserId`; fail closed when the stamp does not match
- B. Move settings into the Dexie vault
- C. Keep settings in `chrome.storage` with no session stamp

## Decision

Settings stay in `chrome.storage.local`. Unlock writes `userSettings` plus `activeUserId`. Reads that see a missing or mismatched stamp must not treat another profile's settings as current.

## Assumptions

- [A1] Settings are small and do not need vault encryption at rest
- [A2] `reconcileActiveSession` (or equivalent) runs before UI trusts settings

## Consequences

Do not silently drop the `activeUserId` stamp. Profile lock/switch tests must cover the fail-closed path.

## Revisit if

Settings become vault-backed, or a second storage driver is introduced.
