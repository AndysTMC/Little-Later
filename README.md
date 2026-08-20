# Little Later

<img src="./assets/logos-and-animations/little-light-icon-b.png" width="150" />

Little Later is a local-first Chrome extension for visual bookmarks, tasks, reminders, notes, and AI-assisted workflows.

There is no backend or hosted sync layer. User data stays in the browser profile and can be protected with the built-in encrypted profile vault.

<img width="400" height="480" alt="1761487550378" src="https://github.com/user-attachments/assets/6b833d48-c4b0-4548-b2b4-46a8e1b4b08c" />
<img width="400" height="480" alt="1761487613165" src="https://github.com/user-attachments/assets/86e86c83-ce91-43fb-b48f-fa9e54b8f06a" />
<img width="400" height="480" alt="1761487575388" src="https://github.com/user-attachments/assets/cf5858e4-a7f6-4c20-b703-3b98b17c5c43" />
<img width="400" height="480" alt="1761487588790" src="https://github.com/user-attachments/assets/b6e3e9b0-b4c8-4698-bc10-b87b195a6734" />
<img width="480" height="270" alt="1761487627545" src="https://github.com/user-attachments/assets/70275a57-3d3b-47a6-9f64-9550e40dec87" />

## Features

- Visual bookmarks with live page previews, saves, and browsing history
- Tasks with ad-hoc, due-date, and recurring schedules
- Reminders with browser notifications and links to bookmarks or tasks
- Notes with card browsing and Markdown edit/preview
- AI Assist for Ollama, LM Studio, and custom OpenAI-compatible providers
- Profiles with export/import, local encryption, and theme support

## Requirements

- Bun `1.3.11` or newer
- A Chromium browser with MV3 extension support

## Local development

```bash
bun install
bun run dev
```

Production build: `bun run build`, then load the `dist` folder from `chrome://extensions` with Developer Mode enabled.

Coding agents: see [AGENTS.md](./AGENTS.md). Human contributors: see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Testing

```bash
bun run typecheck
bun run test
bun run build
```

Optional: `bun run test:e2e`. Live AI checks use `.env` (copy [`.env.example`](./.env.example)): `bun run test:ai:live` and `bun run test:ai:live:validate`.

Ollama and LM Studio use built-in local URLs. Only custom providers need a base URL and API key.

## Data and privacy

- No server architecture
- Local data lives in IndexedDB and Chrome extension storage
- Locked profiles use AES-GCM + PBKDF2 helpers from `packages/shared`
- Export/import stays local (readable JSON or an importable encrypted bundle)

## Installation from releases

1. Open the latest [GitHub Release](https://github.com/AndysTMC/Little-Later/releases/latest).
2. Download `Little-Later-<version>.zip` (supported path) or `Little-Later-<version>.crx` (signed package).
3. For the zip: extract it, open `chrome://extensions/`, enable Developer Mode, **Load unpacked**.
4. The CRX is signed with the repo release key. Chrome on some platforms blocks sideload of non-store CRX files; use the zip there. Each release also includes SHA256 checksums.

## Release flow

1. Update versions in `manifest.json`, `package.json`, and `packages/shared/package.json`.
2. Commit on `main` and push a tag like `v2.1.0`.
3. GitHub Actions builds the zip, signs `Little-Later-<version>.crx` with the `SIGNING_KEY` Actions secret, and uploads checksums.

The signing private key must never be committed. Treat any historical key that appeared in git as burned.

## License

MIT — see [LICENSE.md](./LICENSE.md).

## Acknowledgements

[React](https://reactjs.org/)
| [Vite](https://vitejs.dev/)
| [Dexie.js](https://dexie.org/)
| [TypeScript](https://www.typescriptlang.org/)
| [Framer Motion](https://www.framer.com/motion/)
| [Tailwind CSS](https://tailwindcss.com/)
| [OpenAI](https://openai.com/)
| [Node.js](https://nodejs.org/)
| [Bun](https://bun.sh/)
| [Prettier](https://prettier.io/)

Fell
