---
type: decision
---

# 0002. We will keep a single unlocked Dexie vault

Status: accepted
Date: 2026-08-19
Deciders: existing project
Supersedes: —
Superseded-by: —

## Context

Profiles can be locked. The working database is one Dexie instance (`LLDB`) whose tables hold the current unlocked user's data. Switching or locking replaces that vault rather than keeping several unlocked databases.

## Options

- A. One unlocked vault at a time (current model)
- B. Multiple profiles unlocked in parallel
- C. Per-profile IndexedDB names with several live connections

## Decision

We will keep a single unlocked Dexie vault. Only one profile is current. Lock, unlock, and switch must leave at most that vault readable.

## Assumptions

- [A1] Users do not need two profiles open in the same browser profile at once
- [A2] Vault encrypt/decrypt on lock/unlock stays fast enough for typical local data

## Consequences

`deleteUser`, lock, and switch must not leave another user's tables readable. Tests that open extra tables or skip session reconcile are wrong.

## Revisit if

A product request requires simultaneous multi-profile use, or lock/unlock becomes too slow for large vaults.
