# AGENTS.md

Quick onboarding notes for coding agents working in `D:\Projects\Little-Later`.

## Project shape

- Bun workspace monorepo
- Root workspace = the Chrome extension
- `packages/shared` = shared domain types, enums, constants, and utility helpers
- Architecture is extension-only and local-first; do not assume a backend exists

## Key folders

- `manifest.json` - MV3 manifest and release version
- `src/background/background.ts` - service worker, alarms, notifications, capture, context menu entry points
- `src/popup/App.tsx` - popup routing
- `src/popup/components` - reusable UI pieces
- `src/popup/pages` - route-level pages
- `src/services` - feature logic, AI runtime, notifications, import/export
- `src/utils/db.ts` - Dexie schema and reset/export helpers
- `packages/shared/src` - shared types, crypto, datetime, reminder/task helpers
- `tests` - Vitest coverage and Playwright flows
- `scripts/ai-live-*.ts` - optional live AI smoke/validation runners

## Commands

- Install: `bun install`
- Dev server: `bun run dev`
- Build: `bun run build`
- Type-check: `bun run typecheck`
- Unit/integration tests: `bun run test`
- Playwright: `bun run test:e2e`
- Live AI smoke: `bun run test:ai:live`
- Live AI matrix: `bun run test:ai:live:validate`
- Format check: `bun run format:check`

## AI notes

- Extension AI supports Ollama, LM Studio, and custom OpenAI-compatible providers
- Ollama and LM Studio use built-in local URLs
- Live AI scripts read optional env vars from `.env` via Bun; see `.env.example`
- AI task/save create-update tools are intentionally disabled right now; keep tool contracts aligned with the shipped UI/runtime behavior

## Storage notes

- Production storage uses `chrome.storage.local`
- Dev/test fallback storage lives in `src/utils/chrome.ts` via `localStorage`
- IndexedDB schema lives in `src/utils/db.ts`
- Locked-profile encryption is implemented in `packages/shared/src/utils/crypto.ts`

## Cleanup + release expectations

- Generated files like `dist-release/` and `*.tsbuildinfo` should stay out of commits
- If you change versions, update all three files:
    - `manifest.json`
    - `package.json`
    - `packages/shared/package.json`
- Tagging `v*` triggers `.github/workflows/release.yml`, which builds the extension zip and checksum assets
- GitHub supplies source archives automatically for tagged releases

## Useful implementation reminders

- Data-model changes usually need matching updates in shared types, Dexie schema, services, and tests
- Reminder/task/bookmark changes often ripple into AI tool schemas and runtime tests
- This repo prefers compact, documented fixes over large speculative refactors
