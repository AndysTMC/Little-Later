---
type: now
updated: 2026-11-10
horizon: 2026-11-10 → 2026-11-24
---

# Now

## Focus

3.0.1 is released, with storage format v1 (decisions 0010–0012) in place since 3.0.0. `dev` carries dependency updates since then. Nothing is in progress until the next piece of work is chosen.

## Next

- Build AI tools on the worker commands with `defineTool` (decision 0012).
- Decide the product direction for AI features.
- Decisions 0008 (open-source workflow), 0009 (supply chain and licensing), 0013 (signing key for release tags) and 0014 (issues, not outside pull requests) are `proposed`.
- Design-system phase: fix the React Compiler lint warnings screen by screen, then raise them back to errors (`eslint.config.js`).
- Recompute floating schedules when a page opens; the alarm, start-up, idle and after-command triggers from decision 0011 are in place.

## Blocked

Nothing.

## Do not do

- Merge into `main` or tag a release before the version is approved.
- Mark a decision `accepted` without a named human deciding it.
