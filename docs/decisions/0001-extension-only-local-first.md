---
type: decision
---

# 0001. We will stay extension-only and local-first, with no backend

Status: accepted
Date: 2026-08-19
Deciders: existing project
Supersedes: —
Superseded-by: —

## Context

Little Later stores bookmarks, tasks, reminders, notes, and AI chat data. v2 removed a local server so the product is a Manifest V3 extension only.

## Options

- A. Extension-only; data stays in the browser profile
- B. Hosted sync or a required backend
- C. Optional companion server for some features

## Decision

We will stay extension-only and local-first. Do not add a backend, hosted sync, or a required companion server.

## Assumptions

- [A1] Users accept that data lives in the browser profile and is not synced across devices by this project (revisit if a sync product is explicitly requested)
- [A2] Chrome MV3 APIs remain sufficient for capture, alarms, notifications, and local storage

## Consequences

Agents must not assume an API server. New features must work from the service worker, popup, and IndexedDB / `chrome.storage`.

## Revisit if

A named product decision asks for sync, accounts, or a hosted service.
