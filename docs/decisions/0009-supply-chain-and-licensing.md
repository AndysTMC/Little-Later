---
type: decision
---

# 0009. Measure supply-chain health and ship license notices with every build

Status: proposed
Date: 2026-10-28
Deciders: AndysTMC
Supersedes: —
Superseded-by: —

## Context

Decision 0008 set up the workflow and deferred OpenSSF Scorecard, CodeQL and workflow linting to a follow-up. An audit of `dev` at 0a39e92 against the Scorecard checks, GitHub's community profile and common license practice found:

- **Licensing.** The extension bundles 87 npm packages (81 MIT, 4 Apache-2.0, 2 ISC) and the Rubik font (SIL OFL 1.1). MIT, Apache-2.0 and ISC require their copyright and license text to travel with copies, and OFL requires its license to travel with the font. The built zip carries none of them.
- **Releases.** Assets are a zip, a CRX and checksums. The provenance attestation lives only in GitHub's attestation store, so it cannot be checked offline, and Scorecard's Signed-Releases check sees no signature or provenance file. There is no SBOM.
- **Release safety.** Nothing stops a tag whose number differs from `manifest.json`, or a release whose changelog section is missing. The build job restores `setup-bun`'s dependency cache, which other workflow runs can write (zizmor `cache-poisoning`). The publish job hands `contents: write` to a third-party action (`softprops/action-gh-release`) for something `gh` on the runner already does.
- **Scanning.** No SAST, no Scorecard, nothing audits the workflows themselves, and nothing checks a new dependency's license or known vulnerabilities before it merges. `bun audit` reports 44 advisories in the lockfile (10 in production packages, mostly React Router server-side code that the popup does not run).
- **Community files.** No `SUPPORT.md` or `GOVERNANCE.md`. The README still documents the pre-0008 release flow (commit on `main`), ends with a stray line, and its screenshots have timestamps as alt text.
- GitHub reads Dependabot config, the security policy, issue templates and Scorecard results from the default branch. Until `dev` is released to `main`, none of 0008's files are in effect.

## Options

- A. Do nothing beyond 0008. No work; the gaps above stay.
- B. Add a license plugin from npm (`rollup-plugin-license`) and `anchore/sbom-action` for the SBOM. Mature tools, but a new dependency and a third-party action in the job that holds `SIGNING_KEY`, and syft would describe `node_modules`, not what was bundled.
- C. A small Vite plugin in `scripts/` that reads the modules Rollup actually bundled and writes `THIRD_PARTY_NOTICES.txt` and a CycloneDX 1.6 SBOM into the build; GitHub's own actions for scanning (CodeQL, dependency review, Scorecard) plus zizmor for workflows.
- D. C plus an SBOM attestation (`actions/attest` with `sbom-path`) and OpenSSF Best Practices registration. More signals, but the provenance attestation already covers the SBOM file, and the badge is a form the maintainer fills in by hand.

## Decision

Option C.

- **Notices and SBOM.** `scripts/third-party-notices.ts` runs in every `vite build`. It lists the npm packages behind the bundled modules, copies each one's `LICENSE`/`NOTICE`/`COPYING` files into `dist/THIRD_PARTY_NOTICES.txt`, appends `public/fonts/OFL.txt` for Rubik, and writes `dist/sbom.cdx.json`. Output is sorted and has no timestamp, so the same lockfile gives the same files. No new dependency.
- **Release workflow.** The build job refuses a tag that differs from the version in `manifest.json`, `package.json` or `packages/shared/package.json`, and refuses one with no `## [X.Y.Z]` section in `CHANGELOG.md`; that section becomes the release notes. `setup-bun` runs with `no-cache`. The SBOM ships as `Little-Later-X.Y.Z.cdx.json` and is covered by the existing provenance attestation, whose Sigstore bundle ships as `Little-Later-X.Y.Z.sigstore.json`. The publish job uses `gh release` and re-runs update the existing release.
- **Scanning.** `codeql.yml` analyses JavaScript/TypeScript and the workflows (`security-extended`) on pushes to `main`/`dev`, PRs and weekly. `scorecard.yml` runs on `main` and weekly and publishes results for the README badge. CI gains a `workflows` job (zizmor, online audits) and, on PRs, a `dependency-review` job that fails on a new moderate-or-worse advisory or a license outside an MIT-compatible allow-list.
- **Dependabot.** GitHub Actions updates get the same 7-day cooldown as packages.
- **Community files.** `SUPPORT.md`, `GOVERNANCE.md` (one maintainer, decisions via this folder), `.editorconfig` mirroring Prettier, package metadata (`license`, `repository`, `bugs`, `homepage`), and README fixes: current release and verification steps, a permissions table, badges, links to the community files.
- **Lockfile advisories** are fixed in a separate PR that refreshes `bun.lock` within the existing ranges.
- **New required checks.** `workflows` and `dependency-review` are not added to the ruleset yet; add them once they have run green for a few PRs.

## Trade-offs against the charter

- **Security:** the release can no longer ship under the wrong version or from a poisoned cache, and loses a third-party action with write access. CodeQL and zizmor catch classes of bug the tests do not. Dependency review stops a vulnerable or copyleft package at the PR.
- **Maintainability:** about 360 lines of plugin and tests to own instead of a dependency. Three more workflows for Dependabot to keep current.
- **Release reliability:** two more ways for a release to fail early (version or changelog mismatch). Both are cheap to fix and better than a mislabelled release.
- **Contributor experience:** CI takes a little longer; a PR adding a dependency under an unlisted license fails until the list is changed on purpose.
- **Velocity:** CodeQL adds a few minutes per PR, in parallel with the existing jobs.

## Rollback

Each workflow file is independent; delete it to stop it. Remove the plugin from `vite.config.ts` to stop emitting the notices and SBOM. The release workflow changes revert as one commit. No code or stored data is affected.

## How to verify

- `bun run build` writes `dist/THIRD_PARTY_NOTICES.txt` and `dist/sbom.cdx.json`; `tests/release/third-party-notices.test.ts` covers module-to-package mapping, license files and SBOM shape.
- `zizmor .` reports no findings; `workflows`, `dependency-review` and both CodeQL jobs pass on the PR.
- On the next tag: the release has `.cdx.json` and `.sigstore.json` assets, `gh attestation verify <zip> --bundle <sigstore.json> --repo AndysTMC/Little-Later` passes offline, and the release notes match the changelog section.
- After the next release to `main`: Scorecard results appear in the code scanning tab and the README badge shows a score.

## Assumptions

- [A1] GitHub's dependency graph reads `bun.lock`; if it does not, dependency review still checks `package.json` changes but not transitive ones.
- [A2] Scorecard's Signed-Releases check counts a `.sigstore.json` release asset as a signature.
- [A3] Pinned SHAs match `ossf/scorecard-action v2.5.0`, `github/codeql-action v4.39.1`, `zizmorcore/zizmor-action v0.8.0` and `actions/dependency-review-action v5.0.0` (checked with `git ls-remote` on 2026-10-28).

## Revisit if

A second maintainer joins (CODEOWNERS and required reviews raise Scorecard's Code-Review check), the extension moves to the Chrome Web Store (the store upload joins the release job), or the notices plugin needs to handle a package layout it does not recognise.
