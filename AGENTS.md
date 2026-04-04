# AGENTS.md

This file is a quick onboarding guide for coding agents working in this repository.

## 1) Project at a glance

- Monorepo managed with `pnpm` workspaces.
- Product has 3 main workspaces:
  - `apps/little-later`: Chrome extension (MV3) built with Vite + React + TypeScript.
  - `apps/little-local`: Electron app that runs a local Express + Socket.IO server with SQLite.
  - `packages/shared`: shared enums, types, constants, and utilities used by both apps.
- Goal of architecture: extension can run local-first (Dexie + Chrome storage), and optionally delegate persistence + notifications + AI proxying to Little Local.

## 2) Workspace map

- Root:
  - `package.json`: workspace scripts (`build`, `typecheck`, formatting).
  - `pnpm-workspace.yaml`: includes `apps/*` and `packages/*`.
  - `tsconfig.json`: project references to shared + both apps.
- Extension:
  - `apps/little-later/manifest.json`: MV3 manifest.
  - `apps/little-later/src/background/background.ts`: service worker (alarms, context menus, tab capture).
  - `apps/little-later/src/popup/App.tsx`: popup routes + providers.
  - `apps/little-later/src/services/*`: business logic with local-server fallback.
  - `apps/little-later/src/utils/db.ts`: Dexie schema and DB import/export helpers.
- Local app:
  - `apps/little-local/main.ts`: Electron entry, tray, port switching, starts server.
  - `apps/little-local/server.ts`: Express app + Socket.IO + route wiring.
  - `apps/little-local/routes/*` -> `controllers/*` -> `services/*`: API layers.
  - `apps/little-local/db.ts`: Better-SQLite3 schema (mirrors Dexie structure).
  - `apps/little-local/config.ts`: persisted `port` and `userSettings`.
- Shared:
  - `packages/shared/src/types.ts`: canonical domain types.
  - `packages/shared/src/enums.ts`: enum contracts.
  - `packages/shared/src/constants.ts`: defaults and limits.
  - `packages/shared/src/utils/*`: crypto, datetime, reminder/task logic, misc helpers.

## 3) Data and runtime architecture

- Chrome extension side:
  - Main UI uses React + hooks + Dexie live queries.
  - In dev/non-production, storage helpers use `localStorage`; in production they use `chrome.storage.local`.
  - Background worker captures active-tab snapshots, creates reminders/notifications, and context-menu actions.
- Little Local side:
  - Express API under `/api/*`.
  - SQLite tables intentionally mirror Dexie tables for cross-storage parity.
  - Socket.IO broadcasts DB change events (for extension live refresh while local mode is enabled).
  - Native notifications delivered with Electron `Notification`.
- Shared vault logic:
  - Profile vault encryption/decryption implemented in shared crypto utils (`AES-GCM` + `PBKDF2`).
  - Import/export format is a custom binary package of profile JSON + avatar + encrypted vault.

## 4) Commands you will use

- Install deps: `pnpm install`
- Build all: `pnpm run build`
- Type-check workspace: `pnpm run typecheck`
- Format check: `pnpm run format:check`
- Extension:
  - Dev: `pnpm --filter little-later run dev`
  - Build: `pnpm --filter little-later run build`
  - Test: `pnpm --filter little-later run test`
- Little Local:
  - Dev: `pnpm --filter little-local run dev`
  - Build/package: `pnpm --filter little-local run build`
- Shared package:
  - Build: `pnpm --filter little-shared run build`

## 5) Important implementation patterns

- `apps/little-later/src/services/*` usually follow this shape:
  1) Try `localFetch(...)` when Little Local is enabled.
  2) If not using local mode, execute equivalent Dexie/local logic in extension.
- When adding or changing a domain model, keep these in sync:
  - Shared types/enums/constants
  - Dexie schema (`apps/little-later/src/utils/db.ts`)
  - SQLite schema (`apps/little-local/db.ts`)
  - Service logic in both extension and local app
  - Socket event emission/listening where live refresh is required
- Local API flow pattern is route -> controller -> service; keep domain logic in `services`.

## 6) Known sharp edges in current code

- `localFetch` only returns a response body when status is exactly `200`; `201`/`204` are treated as "used local mode" but body is dropped.
- `apps/little-later/src/services/dataExchange.ts` currently calls `localFetch("/note", ...)` in `importData`, while Little Local import route is `/api/dataExchange/importData`.
- `apps/little-local/services/switch.ts` is empty; switch logic currently lives in `controllers/switch.ts`.
- `apps/little-local/server.ts` CORS checks contain `|| true`, which effectively allows all origins.

## 7) Coding conventions and contribution notes

- TypeScript strict mode is enabled across the repo.
- Formatting:
  - Root/local app generally follow single quotes + 4 spaces.
  - Extension has local Prettier config using tabs.
- Existing naming is `L*` prefixed for many domain types/enums/components; keep that style when touching the same area.
- There are currently no test files in the repository; rely on type-check + targeted manual verification when changing behavior.
- Contribution guidance in `CONTRIBUTING.md`: small, focused PRs are preferred (under ~200 lines when practical).

## 8) Release pipeline (high level)

- GitHub workflow at `.github/workflows/release.yml` builds:
  - `little-local` installers for Windows/macOS/Linux
  - `little-later` extension zip
- Shared package is built first in each job.
- Workflow also generates SHA256 files for release assets.
