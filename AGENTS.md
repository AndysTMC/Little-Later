# Agent protocol

## Commands

- Install: `bun install`
- Dev: `bun run dev`
- Test (one file): `bunx vitest run --environment jsdom --mode testing <file>`
- Test (full): `bun run test`
- Type-check: `bun run typecheck`
- Lint: `bun run lint`
- Format: `bun run format` / `bun run format:check`
- Knowledge lint: `python3 scripts/lint_knowledge.py --strict`
- Build: `bun run build`
- Playwright: `bun run test:e2e`
- Screenshots: `bun run screenshots` (writes `artifacts/screenshots/`)
- Live AI smoke: `bun run test:ai:live`
- Live AI matrix: `bun run test:ai:live:validate`

## Hard rules

- Minimal diffs. Touch only what the task requires.
- Do not add a dependency, edit generated code (`packages/shared/dist`, `dist/`), or change a Dexie schema / shared types without an explicit ask.
- Do not commit secrets, credentials, `.env` values, `*.pem` files, or `SIGNING_KEY`.
- Architecture is extension-only and local-first; do not assume a backend exists.
- If you change versions, update `manifest.json`, `package.json`, and `packages/shared/package.json`.
- AI create/update tools stay behind in-chat confirmation; keep tool contracts aligned with that flow.
- For work that will edit more than two files, write `PLAN.md` first (local; gitignored).
- Run the targeted test, and `python3 scripts/lint_knowledge.py --strict` if docs changed, before calling the task done.
- Branch from `dev` and open pull requests into `dev`; see CONTRIBUTING.md.

## Fixing bugs

- State the root cause in a sentence or two before changing code. If you cannot, keep investigating.
- Reproduce it first, ideally as a failing test. If that is not feasible, say why and what evidence you rely on.
- Fix it at the layer where it originates (the shared helper, the type), not at each call site, and fix every path with the same cause.
- Do not match the reported input, hardcode values, add try/catch, null checks or fallbacks that hide the symptom, or edit a test to pass unless the test is wrong (say so).
- Generalize only as far as the cause reaches. No speculative abstractions or unrelated refactors.
- Before tightening validation, check whether stored data would break, and say what migration it needs.
- If the right fix changes a public interface or needs a redesign, stop and explain the cause, the fix, what it touches and any smaller interim option.
- The pull request states the root cause, where it was fixed, the other cases covered, and how it was verified.

## Commits and pull requests

- Commit as the human contributor, with their own `user.name` and `user.email`. Never author a commit as an AI tool or bot account.
- No `Co-Authored-By`, session or tool trailers for AI tools. A squash merge copies every branch commit's author into the merged commit, so one tool-authored commit adds the tool to the contributor list.
- Name branches after the work (`fix/…`, `feat/…`, `docs/…`), never after a tool.
- Do not rewrite pushed history on `main`, `dev` or another person's branch.
- A pull request body may end with one plain line naming the tool, such as `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Never link a chat, session or conversation.
- Write commits, pull requests, decisions, docs and the changelog as the project's engineering record. Do not quote chats, describe the prompts behind a change, or name the AI that reviewed it.

## Stack notes

- Bun workspace: root = Chrome extension; `packages/shared` = types, enums, constants, crypto/date helpers.
- Production storage: `chrome.storage.local`. Dev/test fallback: `src/utils/chrome.ts` via `localStorage`.
- IndexedDB: `src/utils/db.ts`. Locked-profile encryption: `packages/shared/src/utils/crypto.ts`.
- AI: Ollama, LM Studio, custom OpenAI-compatible. Live scripts read `.env` via Bun; see `.env.example`.
- Tag `v*` triggers `.github/workflows/release.yml`: zip, CRX signed from the `SIGNING_KEY` Actions secret, checksums.

## Authority

- Level 0 (not facts): `PLAN.md`, chat
- Level 1 (draft): `proposed` files in `docs/decisions/`
- Level 2 (constraints): accepted files in `docs/decisions/`
- Level 3 (prefer over prose): `src/utils/db.ts`, `packages/shared/src`, generated `packages/shared/dist`
- Level 4 (do not edit unless asked): this file, `README.md` identity, `LICENSE.md`

## Write permissions

- `PLAN.md`: write.
- Proposed decisions: create; leave `proposed`.
- Accepted decisions, `docs/now.md`, this file, README identity, license: propose a patch. Do not apply silently.
- `Status: proposed` → `accepted`: a named human only. On a PR, add the `human-accepted` label.
- Edits to accepted or superseded decisions need the `human-edited` label; removing one needs `human-removed` (supersede instead). CI's decision gate enforces all three.

## Where to read

| Need                        | File                          |
| --------------------------- | ----------------------------- |
| What this is                | README.md                     |
| What we are doing now       | docs/now.md                   |
| Why a choice was made       | docs/decisions/               |
| Events git will not explain | docs/log.md                   |
| Dexie schema                | src/utils/db.ts               |
| Domain types                | packages/shared/src/types.ts  |
| Service worker              | src/background/background.ts  |
| Popup routes                | src/popup/App.tsx             |
| Feature logic               | src/services/                 |
| Tests                       | tests/                        |
| Release packaging           | .github/workflows/release.yml |
| How to contribute, release  | CONTRIBUTING.md               |
| What changed per version    | CHANGELOG.md                  |
| Reporting vulnerabilities   | SECURITY.md                   |
| License                     | LICENSE.md                    |

## After you finish

Propose, do not silently apply: a `docs/now.md` patch, a decision draft if you chose something, a `CHANGELOG.md` line if users will notice, and a one-line `docs/log.md` note if git will not explain it. Do not silently edit Level 4 files.
