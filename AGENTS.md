# AGENTS.md

This is a quick onboarding guide for coding agents working in this repository.

## Project at a glance

- Monorepo managed with Bun workspaces.
- Main workspace:
  - repo root: Chrome extension (MV3) built with Vite + React + TypeScript.
  - `packages/shared`: shared enums, types, constants, and utilities.
- Architecture is extension-local-first using Dexie + `chrome.storage.local`.

## Workspace map

- Root:
  - `package.json`: workspace scripts (`build`, `typecheck`, formatting).
  - `tsconfig.json`: project references for shared + extension.
- Extension:
  - `manifest.json`: MV3 manifest.
  - `src/background/background.ts`: service worker.
  - `src/popup/App.tsx`: popup routes/providers.
  - `src/services/*`: app business logic.
  - `src/utils/db.ts`: Dexie schema and import/export helpers.
- Shared:
  - `packages/shared/src/types.ts`
  - `packages/shared/src/enums.ts`
  - `packages/shared/src/constants.ts`
  - `packages/shared/src/utils/*`

## Commands

- Install deps: `bun install`
- Build all: `bun run build`
- Type-check: `bun run typecheck`
- Format check: `bun run format:check`
- Extension:
  - Dev: `bun run dev`
  - Build: `bun run build`
  - Test: `bun run test`
- Shared:
  - Build: `bun run --filter little-shared build`

## Implementation notes

- Data model changes usually require updates to:
  - Shared types/enums/constants
  - Dexie schema in `src/utils/db.ts`
  - Extension service logic
- In dev/non-production, `src/utils/chrome.ts` uses `localStorage`; production uses `chrome.storage.local`.
- Profile vault encryption/decryption is in shared crypto utils (`AES-GCM` + `PBKDF2`).

## Release

- Workflow: `.github/workflows/release.yml`
- Builds shared package + extension and publishes `Little-Later-{version}.zip` with SHA256 files.
