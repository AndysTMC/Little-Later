# Little Later

[![CI](https://github.com/AndysTMC/Little-Later/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/AndysTMC/Little-Later/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/AndysTMC/Little-Later/badge)](https://scorecard.dev/viewer/?uri=github.com/AndysTMC/Little-Later)
[![Latest release](https://img.shields.io/github/v/release/AndysTMC/Little-Later)](https://github.com/AndysTMC/Little-Later/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE.md)

<img src="./assets/logos-and-animations/little-light-icon-b.png" width="150" alt="Little Later logo" />

Little Later is a local-first Chrome extension for visual bookmarks, tasks, reminders, notes, and AI-assisted workflows.

There is no backend or hosted sync layer. User data stays in the browser profile and can be protected with the built-in encrypted profile vault.

<img width="400" height="480" alt="Little Later popup screenshot" src="https://github.com/user-attachments/assets/6b833d48-c4b0-4548-b2b4-46a8e1b4b08c" />
<img width="400" height="480" alt="Little Later popup screenshot" src="https://github.com/user-attachments/assets/86e86c83-ce91-43fb-b48f-fa9e54b8f06a" />
<img width="400" height="480" alt="Little Later popup screenshot" src="https://github.com/user-attachments/assets/cf5858e4-a7f6-4c20-b703-3b98b17c5c43" />
<img width="400" height="480" alt="Little Later popup screenshot" src="https://github.com/user-attachments/assets/b6e3e9b0-b4c8-4698-bc10-b87b195a6734" />
<img width="480" height="270" alt="Little Later screenshot" src="https://github.com/user-attachments/assets/70275a57-3d3b-47a6-9f64-9550e40dec87" />

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

`bun run test:e2e` runs the Playwright suite; [CONTRIBUTING.md](./CONTRIBUTING.md#checks) lists every check CI runs. Live AI checks use `.env` (copy [`.env.example`](./.env.example)): `bun run test:ai:live` and `bun run test:ai:live:validate`.

Ollama and LM Studio use built-in local URLs. Only custom providers need a base URL and API key.

## Data and privacy

- No server architecture
- Local data lives in IndexedDB and Chrome extension storage
- Locked profiles use AES-GCM + PBKDF2 helpers from `packages/shared`
- Export/import stays local (readable JSON or an importable encrypted bundle)
- Nothing is sent to a server unless you set up an AI provider. Then your chat messages and the records the AI reads go to that provider, which can be a local server such as Ollama or LM Studio

### Permissions

| Permission                        | Why                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `tabs`, `activeTab`, `<all_urls>` | Capture previews of the pages you visit and save                                   |
| `storage`, `unlimitedStorage`     | Keep settings and the local vault                                                  |
| `alarms`, `notifications`         | Fire reminders and re-run capture after the service worker sleeps                  |
| `contextMenus`                    | "Save" and "Note" actions on the right-click menu                                  |
| `declarativeNetRequest`           | Send a trusted `Origin` header on the extension's own requests to local AI servers |

## Installation from releases

1. Open the latest [GitHub Release](https://github.com/AndysTMC/Little-Later/releases/latest).
2. Download `Little-Later-<version>.zip` (supported path) or `Little-Later-<version>.crx` (signed package).
3. For the zip: extract it, open `chrome://extensions/`, enable Developer Mode, **Load unpacked**.
4. The CRX is signed with the repo release key. Chrome on some platforms blocks sideload of non-store CRX files; use the zip there.

Every release is built by GitHub Actions from a tag on `main` and ships SHA256 checksums, a CycloneDX SBOM (`.cdx.json`) and a signed build provenance bundle (`.sigstore.json`). To check that a download came from this repository's workflow:

```sh
gh attestation verify Little-Later-<version>.zip --repo AndysTMC/Little-Later
```

How releases are cut is in [CONTRIBUTING.md](./CONTRIBUTING.md#releases).

## Contributing and support

- [Contributing guide](./CONTRIBUTING.md) and [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Getting help](./SUPPORT.md) and [how the project is run](./GOVERNANCE.md)
- [Security policy](./SECURITY.md): report vulnerabilities privately, not in issues
- [Changelog](./CHANGELOG.md) and [design decisions](./docs/decisions/_index.md)

## License

MIT, see [LICENSE.md](./LICENSE.md). Every build includes `THIRD_PARTY_NOTICES.txt` with the license of each bundled package; the Rubik font is under the SIL Open Font License ([public/fonts/OFL.txt](./public/fonts/OFL.txt)).

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
