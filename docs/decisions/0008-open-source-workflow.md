---
type: decision
---

# 0008. Run the repository like an open-source project

Status: proposed
Date: 2026-10-27
Deciders: AndysTMC
Supersedes: —
Superseded-by: —

## Context

Little Later is MIT-licensed and public, but the repository has few of the things an outside contributor or user looks for:

- No security policy, so a vulnerability report has nowhere private to go.
- No changelog; release notes live only in commit subjects and GitHub releases (`v1.0.0`, `v2.0.0`, `v2.1.0`).
- No issue or PR templates, and `CONTRIBUTING.md` has no setup steps or required checks.
- The Code of Conduct (Contributor Covenant 1.4) still says `[INSERT EMAIL ADDRESS]`.
- Workflows use mutable action tags (`actions/checkout@v5`, `softprops/action-gh-release@v2.4.0`) and the token's default permissions; the release job gives `contents: write` to every step, including `bun install`, while `SIGNING_KEY` is in reach. A moved tag in a third-party action or a compromised package could read the key or rewrite the repository.
- The release workflow can be started by hand from any branch with any tag name, and a second run cancels a release in progress.
- No automated dependency updates.
- Everything lands straight on `main`, which is also what release tags are cut from.

## Options

- A. Leave it as it is. No work, but contributors and reporters have no path, and the release job keeps trusting mutable tags.
- B. Adopt the common lightweight set, documented and enforced by GitHub settings rather than new tooling: a `dev` integration branch, squash merges with Conventional Commits titles, SemVer, a hand-written Keep a Changelog file, `SECURITY.md` using GitHub private vulnerability reporting, issue forms and a PR template, Dependabot for GitHub Actions and Bun, actions pinned to commit SHAs, `CODEOWNERS`, and Contributor Covenant 2.1.
- C. B plus release automation now (release-please or semantic-release, commitlint and a commit hook). Generated changelogs and version bumps, but it adds dependencies and a bot with write access before there is a release cadence to automate.
- D. B plus a Developer Certificate of Origin sign-off on every commit. Stronger provenance for contributions, but friction for drive-by fixes; MIT inbound equals outbound already covers licensing.

## Decision

Option B.

- **Branches.** `dev` is the integration branch; `main` only moves at a release. Work happens on short branches named after the work (`fix/…`, `feat/…`, `docs/…`, `chore/…`), opened as PRs into `dev`. Urgent fixes branch off `main` and are merged back into `dev`.
- **Commits.** PRs are squash-merged, and the PR title becomes the commit subject in Conventional Commits form (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `build:`, `perf:`, with `!` for breaking). Earlier history keeps its plain subjects.
- **Releases.** A release is a PR from `dev` into `main` that bumps the version in `manifest.json`, `package.json` and `packages/shared/package.json` and moves the changelog's Unreleased section under the new version; then a `vX.Y.Z` tag on `main` runs `release.yml`. The release PR proposes the version with a one-line reason drawn from the changelog (a breaking change, new features, or only fixes); the maintainer approves it or picks another. Versions follow SemVer, with a change to a stored format or a removed feature counted as breaking.
- **Security.** `SECURITY.md` sends reports to GitHub private vulnerability reporting, states the supported version (latest release) and a response target.
- **Merging.** Feature PRs into `dev` are squash-merged. The release PR from `dev` into `main` uses a merge commit, so the two branches keep a shared history and later release PRs show only new work. A hotfix is released from `main` with its changelog entry under the released version, and `main` is merged back into `dev` straight away.
- **CI** runs on pushes to `main` and `dev` and on every PR, with a read-only token and no persisted checkout credentials.
- **Release workflow.** Read-only by default. The build job (which holds `SIGNING_KEY`) can only read the repository; it refuses a tag whose commit is not on `main`, attests build provenance for the zip and CRX, and hands the files to a separate publish job, the only one with `contents: write`. A manual run must be started from the tag itself. Releases are never cancelled by a later run.
- **Supply chain.** Every `uses:` is pinned to a full commit SHA with the version in a comment, on the major version already in use. Dependabot opens weekly PRs into `dev` for GitHub Actions and Bun packages, minor and patch grouped, majors on their own, with a 7-day cooldown on packages.
- **Templates.** Issue forms for bugs and features, a contact link to the security policy, and a PR template whose checklist mirrors the CI gates.
- **Conduct.** Contributor Covenant 2.1, with reports going to the maintainer.

Settings only the owner can change, which this record depends on: default branch stays `main` (feature PRs target `dev` explicitly); branch protection or rulesets on `main` and `dev` (PR required, CI `check` and `e2e` required, no force push, 0 approvals so a single maintainer is not blocked); squash and merge-commit merging both allowed; private vulnerability reporting on; optionally a `release` environment holding `SIGNING_KEY`, limited to `v*` tags.

## Trade-offs against the charter

- **Security:** pinning and Dependabot shrink the window where a compromised action or package reaches the signing secret; private reporting gives researchers a safe channel.
- **Maintainability:** about 10 small files; a hand-written changelog is a small recurring cost per PR and can conflict in `Unreleased`, which the merge-back rule keeps rare.
- **Release reliability:** the release now needs two jobs and an artifact hand-off; a failure between them leaves no half-published release, but a re-run is needed.
- **Contributor experience:** clearer path in; Conventional Commits titles are one more rule, softened by applying only to the squash title, not every commit.
- **Velocity:** two long-lived branches mean a release PR and a merge-back after hotfixes. With one maintainer this is light; revisit if it turns into busywork.

## Rollback

Each file is independent; deleting it or reverting the PR restores the previous state. Unpinning actions is a one-line change per step. The `dev` branch can be deleted once merged into `main`. No code or stored data is affected.

## How to verify

- CI passes on the PR into `dev` with pinned actions and read-only permissions.
- Each pinned SHA matched its tag with `git ls-remote` on 2026-10-27; Dependabot keeps them current from here.
- The release workflow is exercised on the next tag: the build job must refuse a tag that is not on `main`, and `gh attestation verify` must pass on the published zip.
- GitHub shows the issue forms, the PR template and the security policy on the repository's Community Standards page.

## Assumptions

- [A1] Dependabot supports the `bun` ecosystem and reads `bun.lock`. GitHub announced general availability in 2025.
- [A2] The pinned SHAs are the commits behind `actions/checkout v5.1.0`, `oven-sh/setup-bun v2.2.0`, `actions/upload-artifact v4.6.2`, `actions/download-artifact v4.3.0`, `actions/attest-build-provenance v4.2.2` and `softprops/action-gh-release v2.4.0` (checked with `git ls-remote` on 2026-10-27).
- [A3] The repository is public, so the release job can fetch `main` without persisted credentials.

## Review

An independent review of the first draft led to these changes. Adopted: CI on `dev`; least-privilege tokens and no persisted credentials; split release build and publish; refuse tags not on `main` and drop the free-form tag input; never cancel a release; merge commits for release PRs and an explicit hotfix merge-back; Dependabot grouping and cooldown; build provenance attestations; 0-approval branch rules in the settings list; corrected "floating" to "mutable" tags; dropped `CODEOWNERS`, which adds nothing with one maintainer. Deferred: OpenSSF Scorecard and CodeQL (a follow-up PR), `actionlint` in CI, and a tag ruleset (the release job already refuses tags that are not on `main`).

## Revisit if

Releases become frequent enough that release-please would save time, more maintainers join (then consider CODEOWNERS per area and DCO), or the extension moves to the Chrome Web Store (then the release PR also triggers the store upload).
