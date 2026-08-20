# Agent protocol

## Commands

- Install: `bun install`
- Dev: `bun run dev`
- Test (one file): `bunx vitest run --environment jsdom --mode testing <file>`
- Test (full): `bun run test`
- Type-check: `bun run typecheck`
- Lint / format: `bun run format` / `bun run format:check`
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
- Run the targeted test before calling the task done.

## Stack notes

- Bun workspace: root = Chrome extension; `packages/shared` = types, enums, constants, crypto/date helpers.
- Production storage: `chrome.storage.local`. Dev/test fallback: `src/utils/chrome.ts` via `localStorage`.
- IndexedDB: `src/utils/db.ts`. Locked-profile encryption: `packages/shared/src/utils/crypto.ts`.
- AI: Ollama, LM Studio, custom OpenAI-compatible. Live scripts read `.env` via Bun; see `.env.example`.
- Tag `v*` triggers `.github/workflows/release.yml`: zip, CRX signed from the `SIGNING_KEY` Actions secret, checksums.

## Authority

- Level 0 (not facts): `PLAN.md`, chat
- Level 2 (constraints): accepted files in `docs/decisions/`
- Level 3 (prefer over prose): `src/utils/db.ts`, `packages/shared/src`, generated `packages/shared/dist`
- Level 4 (do not edit unless asked): this file, `README.md` identity, `LICENSE.md`

## Where to read

| Need                        | File                          |
| --------------------------- | ----------------------------- |
| What this is                | README.md                     |
| Why a choice was made       | docs/decisions/               |
| Events git will not explain | docs/log.md                   |
| Dexie schema                | src/utils/db.ts               |
| Domain types                | packages/shared/src/types.ts  |
| Service worker              | src/background/background.ts  |
| Popup routes                | src/popup/App.tsx             |
| Feature logic               | src/services/                 |
| Tests                       | tests/                        |
| Release packaging           | .github/workflows/release.yml |
| License                     | LICENSE.md                    |

## After you finish

Propose, do not silently apply: a decision draft if you chose something, a one-line `docs/log.md` note if git will not explain it. Do not silently edit Level 4 files.
