# Little Later

![Little Later logo](./assets/logos-and-animations/little-light-icon-b.png)

Little Later is a local-first Chrome extension for visual bookmarks, tasks, reminders, notes, and AI-assisted workflows.

There is no backend or hosted sync layer in this project. User data stays in the browser profile and can be protected with the built-in encrypted profile vault.

## What ships in v2.0.0

- Visual bookmarks with live page previews, saves, and history
- Tasks with ad-hoc, due, and recurring schedules
- Reminders with browser notifications and bookmark/task links
- Notes with card browsing, a dedicated editor, and Markdown preview/edit modes
- AI Assist with Ollama, LM Studio, and custom OpenAI-compatible providers
- Profile export/import, local encryption, and theme support

## Tech stack

- Bun workspaces
- Vite + React + TypeScript
- MV3 Chrome extension runtime
- Dexie for local IndexedDB storage
- `chrome.storage.local` in production and `localStorage` in dev/test fallbacks
- `packages/shared` for shared types, enums, constants, and crypto/date helpers

## Repo layout

- `manifest.json` - MV3 manifest
- `src/background/background.ts` - service worker, alarms, capture, notifications
- `src/popup` - popup routes, pages, components, hooks, and styling
- `src/services` - business logic for notes, tasks, reminders, visual bookmarks, AI, export/import
- `src/utils/db.ts` - Dexie schema and database helpers
- `packages/shared/src` - shared domain types and utility functions
- `tests` - Vitest integration/unit coverage plus Playwright AI flows
- `.github/workflows/release.yml` - tag-driven release packaging

## Requirements

- Bun `1.3.11` or newer
- A Chromium browser with MV3 extension support

## Local development

```bash
bun install
bun run dev
```

For a production build:

```bash
bun run build
```

Then load the generated `dist` folder from `chrome://extensions` with Developer Mode enabled.

## Testing

Core validation:

```bash
bun run typecheck
bun run test
bun run build
```

Optional Playwright coverage:

```bash
bun run test:e2e
```

Optional live AI validation uses `.env` values loaded by Bun. Copy `.env.example` to `.env` and fill in the provider you want to validate:

```bash
bun run test:ai:live
bun run test:ai:live:validate
```

Supported live AI setup:

- `AI_LIVE_CUSTOM_BASE_URL` - custom OpenAI-compatible endpoint
- `AI_LIVE_CUSTOM_API_KEY` - API key for the custom endpoint
- `AI_LIVE_MODEL` - preferred model name
- `AI_LIVE_DEBUG=1` - verbose live validation logging
- `AI_LIVE_ONLY` - run a single filtered live scenario

## AI providers in the extension

Little Later currently supports:

- Ollama
- LM Studio
- Custom OpenAI-compatible providers

Ollama and LM Studio use built-in local URLs. Only custom providers require a base URL and API key.

## Data and privacy

- No server architecture is used
- Local data lives in IndexedDB and Chrome extension storage
- Locked profiles store encrypted vault data using AES-GCM + PBKDF2 helpers from `packages/shared`
- Export/import stays local and works with readable JSON or importable binary bundles

## Installation from releases

1. Open the latest [GitHub Release](https://github.com/AndysTMC/Little-Later/releases/latest).
2. Download `Little-Later-<version>.zip`.
3. Extract it to any folder.
4. Open `chrome://extensions/`.
5. Enable Developer Mode.
6. Click `Load unpacked` and select the extracted folder.

Each release also includes SHA256 checksum files. GitHub automatically provides source archives (`.zip` / `.tar.gz`) for every tagged release.

## Release flow

1. Update versions in `manifest.json`, `package.json`, and `packages/shared/package.json`.
2. Commit on `main`.
3. Create and push a tag like `v2.0.0`.
4. GitHub Actions builds the extension and uploads `Little-Later-<version>.zip` plus checksum files to the release.

## Notes for contributors

- This project is intentionally extension-only and local-first.
- Keep changes simple and avoid introducing server dependencies.
- Data-model changes usually touch shared types plus `src/utils/db.ts` and related service logic.
- If you change reminder/task/bookmark behavior, also check AI tool contracts and tests.

## License

MIT - see [LICENSE.md](./LICENSE.md).
