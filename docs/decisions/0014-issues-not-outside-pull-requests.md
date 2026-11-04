---
type: decision
---

# 0014. Outside contributions come as issues, not pull requests

Status: proposed
Date: 2026-11-04
Deciders: AndysTMC
Supersedes: —
Superseded-by: —

## Context

The project has a small team: one maintainer and a few collaborators. Reviewing an outside pull request means checking code written without the context in `docs/decisions/`, often against the single-writer and storage-format rules that are easy to break and hard to spot in review. A good bug report with a diagnosis usually saves the team more time than a ready-made patch.

## Options

- A. Accept pull requests from anyone (decision 0008's default). The widest path in, but review load grows with every drive-by change.
- B. Take issues from anyone and pull requests only from the team. Reporters can still include logs, the suspect code or a diff, and are credited in the pull request that lands the fix.

## Decision

Option B.

- `CONTRIBUTING.md` opens with the rule, then explains what makes a useful issue and how credit works. The rest of the guide is for the team.
- The bug form has an optional field for a diagnosis or a diff.
- The repository setting that limits who can open pull requests is set to collaborators.
- The code stays under the MIT License; anyone may fork it.

## Trade-offs against the charter

- **Maintainability:** every change is written by someone who knows the decisions it has to respect.
- **Contributor experience:** outside contributors cannot land code themselves; their diagnosis still counts and is credited.
- **Velocity:** fewer, larger reviews are replaced by issue triage, which is cheaper.

## Rollback

Restore the earlier `CONTRIBUTING.md` wording and allow pull requests from all users in the repository settings.

## How to verify

- Opening a pull request from an account that is not a collaborator is refused by GitHub.
- The bug form shows the "Diagnosis or fix" field.

## Revisit if

The team grows enough to review outside pull requests, or issues regularly carry complete fixes that would be cheaper to merge than to rewrite.
