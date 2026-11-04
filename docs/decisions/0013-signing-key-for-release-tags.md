---
type: decision
---

# 0013. Only release tags can use the signing key

Status: proposed
Date: 2026-10-29
Deciders: AndysTMC
Supersedes: —
Superseded-by: —

## Context

The repository has collaborators with write access. With write access, a collaborator can push a `v*` tag, start a workflow on any branch they push, and change workflow files on that branch. When the release signing key is a repository-level Actions secret, a workflow on any branch can read it and sign a CRX with the project's extension ID.

## Options

- A. Keep `SIGNING_KEY` as a repository secret. No setup, but any branch workflow can read it.
- B. Move the key into a `release` environment that only `v*` tags can use and that needs the maintainer's approval, and let only the maintainer create, move or delete `v*` tags.

## Decision

Option B.

- **Release workflow.** The `build` job, the only job that reads `SIGNING_KEY`, runs in the `release` environment. The `publish` job reads no secret and only runs after an approved build.
- **Repository settings** (outside git, set by the maintainer): the `release` environment allows only tags matching `v*`, requires the maintainer as reviewer, and holds `SIGNING_KEY`; there is no repository-level copy. A tag ruleset on `refs/tags/v*` restricts creation, updates and deletion, with only the repository admin role able to bypass. Collaborators get the Write role or lower.

This only protects the key and the release workflow. It places no limit on what anyone may do with the code, which stays under the MIT License.

## Trade-offs against the charter

- **Security:** a collaborator, or a stolen collaborator token, can no longer sign a CRX, read the key from a branch workflow, or start a release.
- **Release reliability:** each release waits for one approval click. If the environment is not set up, GitHub creates it unprotected on the first run and the release still works.
- **Contributor experience:** unchanged for code; contributors do not cut releases.

## Rollback

Remove `environment: release` from the build job and move `SIGNING_KEY` back to a repository secret.

## How to verify

- A workflow started from a branch cannot read `SIGNING_KEY` (the environment rejects the ref).
- Pushing a `v*` tag as a collaborator is refused by the tag ruleset.
- A tag pushed by the maintainer pauses the `build` job at "Waiting for review" until approved.

## Assumptions

- [A1] The maintainer is the only repository admin.
- [A2] GitHub applies an environment's deployment ref rule before handing its secrets to a job.

## Revisit if

A second maintainer joins, or the signing key is rotated.
