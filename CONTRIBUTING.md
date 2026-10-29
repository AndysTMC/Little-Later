# Contributing to Little Later

Thanks for helping. Little Later is a local-first Chrome extension: no backend, and your data never leaves the browser unless you send it to an AI provider you chose.

## Before you start

- **Bugs:** open an issue with the bug form. Security problems go through [SECURITY.md](./SECURITY.md), never a public issue.
- **Features:** open an issue with the feature form first. Large unannounced pull requests are hard to review and may be closed.
- **Design choices** are recorded in [docs/decisions/](./docs/decisions/). A change that goes against one needs a new decision record.

## Set up

You need [Bun](https://bun.sh) 1.3 or later, and Node.js 22 or later for the test runner.

```sh
bun install
bun run build:shared
bun run dev
```

Load `dist/` as an unpacked extension from `chrome://extensions` with Developer mode on. While `bun run dev` is running, `dist/` loads the code from the dev server and reloads on change, so it stops working when you stop the server. For a build that runs on its own, use `bun run build` and load `dist/` again.

The end-to-end tests need Playwright's Chromium. Install it once, and again after a Playwright update in `bun.lock`:

```sh
bunx playwright install chromium
```

## Branches and pull requests

- Branch from `dev` and name the branch after the work: `fix/lock-timeout`, `feat/voice-notes`, `docs/setup`.
- Open the pull request into `dev`. `main` only moves when a release is cut.
- Title the pull request in [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) form, for example `fix: keep the lock screen open after a wrong password`. Pull requests are squash-merged, so the title becomes the commit message. Use `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci` or `chore`, and add `!` for a breaking change.
- Keep a pull request to one change. Under about 400 changed lines is easiest to review.
- Add a line to the `Unreleased` section of [CHANGELOG.md](./CHANGELOG.md) when users would notice the change.

## Checks

CI runs all of these, so run them before you push:

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:e2e
```

New behaviour needs a test. A change to stored data needs a migration and a test that runs it.

## Releases

A release starts with a pull request from `dev` into `main` that bumps the version in `manifest.json`, `package.json` and `packages/shared/package.json` and moves the changelog's `Unreleased` entries under the new version. Its description proposes the version and why: major for a breaking change, minor for new features, patch for fixes only. That pull request is merged with a merge commit, not squashed, so `dev` and `main` keep a shared history. The decision gate skips this pull request, because every decision change in it already passed the gate on its way into `dev`. Tagging `vX.Y.Z` on `main` then builds and publishes the release. Only the maintainer can create release tags, and the signing job waits for the maintainer's approval in the `release` environment, which holds `SIGNING_KEY`.

An urgent fix branches from `main`, is released the same way, and `main` is then merged back into `dev`.

## Conduct and license

Everyone taking part follows the [Code of Conduct](./CODE_OF_CONDUCT.md). By opening a pull request you agree to license your contribution under the [MIT License](./LICENSE.md).
