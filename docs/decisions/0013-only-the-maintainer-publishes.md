---
type: decision
---

# 0013. Only the maintainer can publish official builds

Status: proposed
Date: 2026-10-29
Deciders: AndysTMC
Supersedes: —
Superseded-by: —

## Context

The repository now has collaborators with write access. With write access, a collaborator can push a `v*` tag, start a workflow on any branch they push, and change workflow files on that branch. The release signing key is a repository-level Actions secret, so a workflow on any branch can read it. Anyone with write access could therefore sign a CRX with the project's extension ID or start a release.

The extension may later be listed on the Chrome Web Store. The store listing belongs to one developer account, and only that account, or people it adds to a group publisher, can upload to it.

The code is MIT-licensed, so anyone may build and publish their own copy, on the store or elsewhere. A license cannot take that back for versions already released. What the license does not grant is the project's name and logo.

## Options

- A. Leave it to trust. No work, but any collaborator, or a leaked collaborator token, can sign or publish.
- B. Gate the release in GitHub: the signing key moves into a `release` environment that only `v*` tags can use and that needs the maintainer's approval; a tag ruleset lets only the maintainer create, move or delete `v*` tags. Copies are handled by a name and logo policy.
- C. B, plus a license that forbids redistribution. Stops copies of future versions, but the project stops being open source and versions already released stay MIT.

## Decision

Option B.

- **Release workflow.** The `build` job, the only job that reads `SIGNING_KEY`, runs in the `release` environment. The `publish` job reads no secret and only runs after an approved build.
- **Repository settings** (outside git, set by the maintainer): the `release` environment allows only tags matching `v*`, requires the maintainer as reviewer, and holds `SIGNING_KEY`; the repository-level copy is deleted. A tag ruleset on `refs/tags/v*` restricts creation, updates and deletion, with only the repository admin role able to bypass. Collaborators get the Write role or lower, never Admin or Maintain.
- **Chrome Web Store.** The listing lives in the maintainer's developer account, with 2-Step Verification on and no group publisher. Store API credentials, if uploads are ever automated, are secrets of the `release` environment only.
- **Name and logo.** `TRADEMARKS.md` says the MIT License covers the code, not the name and logo, and that a published copy needs its own name and icons. The README, `CONTRIBUTING.md` and `GOVERNANCE.md` link to it.

## Trade-offs against the charter

- **Security:** a collaborator, or a stolen collaborator token, can no longer sign a CRX, read the key from a branch workflow, or start a release.
- **Release reliability:** each release waits for one approval click. If the environment is not set up, GitHub creates it unprotected on the first run and the release still works.
- **Contributor experience:** unchanged for code; contributors cannot cut releases, which they could not do by policy anyway.
- **Openness:** the code stays MIT. The name and logo policy relies on trademark law and store impersonation rules, not on the license.

## Rollback

Remove `environment: release` from the build job and move `SIGNING_KEY` back to a repository secret. Delete `TRADEMARKS.md` and its links.

## How to verify

- A workflow started from a branch, or a `release` job started from anything but a `v*` tag, cannot read `SIGNING_KEY` (the environment rejects the ref).
- Pushing a `v*` tag as a collaborator is refused by the tag ruleset.
- A tag pushed by the maintainer pauses the `build` job at "Waiting for review" until approved.

## Assumptions

- [A1] The maintainer is the only repository admin.
- [A2] GitHub applies an environment's deployment ref rule before handing its secrets to a job.

## Revisit if

A second maintainer joins, the extension is listed on the Chrome Web Store (the store sets its own extension ID, so the store upload must not carry the self-hosted `key` from decision 0006, and the store's verified CRX uploads can tie uploads to a key in the `release` environment), or the license changes.
