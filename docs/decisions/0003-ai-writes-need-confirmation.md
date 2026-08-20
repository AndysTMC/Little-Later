# 0003. AI may read freely; mutate, destructive, and export tools require in-chat confirmation

Status: accepted
Date: 2026-08-19
Deciders: existing project
Supersedes: —
Superseded-by: —

## Context

The extension AI can list and search local data, and can create or update tasks and saves. Writes that run without a user click are a data-loss and surprise risk.

## Options

- A. Queue mutate / destructive / export tools and run them only after in-chat Confirm
- B. Disable all write tools
- C. Auto-run writes and offer undo only

## Decision

Read tools run immediately. Create/update/delete/export tools are queued as pending mutations and run only after the user confirms in the chat UI. Cancel feeds the model and does not apply the writes.

## Assumptions

- [A1] Users will see and use the in-chat Confirm / Cancel control
- [A2] Re-normalizing arguments at confirm time (from the queued raw args) is enough to catch stale or invalid dates

## Consequences

Tool registry `safety` kinds and the confirmation UI must stay aligned. Tests must not expect writes during `prompt()` for mutating tools.

## Revisit if

A tool must run without a click for a stated accessibility or automation reason, or confirmation is regularly skipped by mistake.
