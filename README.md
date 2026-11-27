<div align="center">

<picture>
	<source media="(prefers-color-scheme: dark)" srcset="./assets/logos-and-animations/little-dark-icon-b.png" />
	<img src="./assets/logos-and-animations/little-light-icon-b.png" width="120" alt="Little Later logo" />
</picture>

# Little Later

**Save it now, get back to it later.** A local-first Chrome extension for saved pages, tasks, reminders and notes, with an optional AI assistant that can run on your own machine.

[![CI](https://github.com/AndysTMC/Little-Later/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/AndysTMC/Little-Later/actions/workflows/ci.yml)
[![CodeQL](https://github.com/AndysTMC/Little-Later/actions/workflows/codeql.yml/badge.svg?branch=dev)](https://github.com/AndysTMC/Little-Later/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/AndysTMC/Little-Later/badge)](https://scorecard.dev/viewer/?uri=github.com/AndysTMC/Little-Later)
[![Latest release](https://img.shields.io/github/v/release/AndysTMC/Little-Later)](https://github.com/AndysTMC/Little-Later/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE.md)

</div>

<p align="center">
	<img width="260" alt="Saved pages with previews" src="./assets/screenshots/saves.png" />
	<img width="260" alt="Tasks with priorities and tags" src="./assets/screenshots/tasks.png" />
	<img width="260" alt="Reminders" src="./assets/screenshots/reminders.png" />
	<br />
	<img width="260" alt="Notes and locked notes" src="./assets/screenshots/notes.png" />
	<img width="260" alt="Encrypted images vault" src="./assets/screenshots/images.png" />
	<img width="260" alt="Little AI" src="./assets/screenshots/little-ai.png" />
</p>

Little Later has no account, no server and no sync. Everything you save is stored in your browser profile and encrypted on disk. The only data that ever leaves your machine is what you choose to send to an AI provider you set up yourself.

## Features

- **Saves and history.** Little Later keeps a history of the pages you visit, each with a screenshot preview, URL, and optional encrypted offline article snapshot. Save or archive pages, and exclude sites you do not want recorded in **Settings → Data & Privacy**.
- **Tasks.** Tasks with priority, no deadline, a due date, or a daily, weekly, monthly or yearly repeat. Overdue tasks move to a Missed group, and a task can carry its own reminder.
- **Reminders.** Browser notifications at a set time, or escalating reminders that fire more often as the time gets close. Recurring times follow you when you change time zone.
- **Notes and locked notes.** Markdown notes with edit and preview, plus password-locked notes that require re-verification to view and stay hidden from search, Little AI and external MCP. Right-click selected text to save a note or quote.
- **Images.** Encrypted image vault: right-click any image to save it or upload from disk, tag it, view details and download later.
- **Tags, links and search.** Organise saves, tasks, reminders, notes and images with `#tags`, link records together, and search across everything.
- **Profiles and security.** Multiple profiles with accent themes (light or dark), optional password encryption and optional passkey or security-key two-factor unlock.
- **Backups and portable exports.** Export a profile as an encrypted `.lldat` backup you can import later, or export readable JSON, Obsidian Markdown (`.md`), iCalendar (`.ics`), or Netscape Bookmarks (`.html`) — and import browser bookmarks HTML.
- **Popup or side panel.** Use Little Later from the toolbar popup or run the entire extension (or just Little AI) in Chrome's side panel (**Settings → Misc → Side panel**).
- **Little AI & local MCP/CLI (optional).** Built-in AI assistant (in the popup, side panel, or a tab) with searchable model switching, local or cloud providers, encrypted chat history, hybrid search, multi-server local MCP support, and the `little-later-mcp` bridge & full-parity CLI (`npx -y little-later-mcp`). Every AI write waits for your confirmation in the chat.

## Install

Little Later needs **Chrome 144 or later**, or another Chromium-based browser on the same version. It is not on the Chrome Web Store.

### From a GitHub release

1. Download `Little-Later-<version>.zip` from the [latest release](https://github.com/AndysTMC/Little-Later/releases/latest).
2. Extract it to a folder you will keep.
3. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and select the folder.

To update, replace the folder's contents with the new release and click the extension's reload button. Release builds carry a fixed extension ID, so your data stays.

The release also has a signed `.crx`. Chrome on Windows and macOS only installs extensions from outside the Web Store through enterprise policy, so most people should use the zip.

Every release is built by GitHub Actions from a version tag on `main`, and ships SHA-256 checksums, a CycloneDX SBOM and signed build provenance. To check that a download was built from this repository:

```sh
gh attestation verify Little-Later-<version>.zip --repo AndysTMC/Little-Later
```

[SECURITY.md](./SECURITY.md#verifying-a-release) explains offline verification.

### From source

You need [Bun](https://bun.sh) 1.3.11 or later.

```sh
git clone https://github.com/AndysTMC/Little-Later.git
cd Little-Later
bun install
bun run build
```

Then load the `dist/` folder with **Load unpacked** as above.

> [!IMPORTANT]
> Version 3.0 stores data in a new encrypted format. Updating from 2.x removes the old data, and 2.x backups cannot be imported. Export what you want to keep as readable JSON before you update.

## Privacy and security

**What is stored.** Saves, history, tasks, reminders, notes, page previews and settings live in the extension's IndexedDB database and `chrome.storage` in your browser profile. Nothing is uploaded, and there is no telemetry.

**What is captured.** While a profile is unlocked, Little Later records the web pages you visit (`http` and `https` only) with a screenshot preview, to build your history. You choose how many history entries to keep, and how many per site, in **Settings → Misc**. Nothing is captured while the profile is locked.

**How it is encrypted.**

- Each profile has its own random 256-bit key. Every record's content (titles, URLs, page text, notes, task and reminder text, previews, and the AI provider settings including any API key) is encrypted with AES-256-GCM under that key.
- With a password, the profile key is wrapped by a key derived from the password with PBKDF2-SHA-256 at 600,000 iterations. Locking removes the unwrapped key from memory.
- A profile without a password still encrypts its records, but its key is stored next to them, so the app labels it _not encrypted at rest_.
- Some metadata stays readable so reminders can fire while locked: timestamps, status flags, schedules, the profile's name and avatar, and keyed hashes of URLs. It shows when and how often you saved something and repeat visits to a site, but not what you saved.
- There is no password recovery. If you forget a profile's password, its data cannot be read.

**Locking.** A password-protected profile locks when the browser starts, when the extension updates, when your screen locks, and after an idle time you choose (30 minutes by default). Reminders still fire while locked and ask you to unlock to see them.

**Backups.** A `.lldat` backup is encrypted with a password you choose when you export it. Importing creates a new profile with fresh keys and does not bring back the AI provider settings. The readable JSON export is plain text and leaves out API keys.

The full design, including exactly which fields stay readable, is in [decision 0010](./docs/decisions/0010-format-v1-storage-and-keys.md). To report a vulnerability, follow [SECURITY.md](./SECURITY.md).

### Permissions

| Permission                        | Why                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `tabs`, `activeTab`, `<all_urls>` | Record visited pages and take their screenshot previews                          |
| `storage`, `unlimitedStorage`     | Keep your data and settings in the browser, without the default storage cap      |
| `alarms`, `notifications`         | Fire reminders on time, even after Chrome suspends the background worker         |
| `idle`                            | Lock the profile when the screen locks or after the idle time you set            |
| `contextMenus`                    | **Save page**, **Save image**, **Save quote**, **Note text** and AI note actions |
| `declarativeNetRequest`           | Let the extension's own requests reach local AI servers on this machine          |
| `sidePanel`, `scripting`          | Run Little AI in Chrome's side panel and read the active page when you ask       |
| `nativeMessaging` _(optional)_    | Opt-in local MCP bridge for external agents (**Settings → Data & Privacy**)      |

## AI assistant

Little AI is off until you configure it in **Settings → AI**. It supports **Local** servers ([Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai), Local vLLM, llama.cpp), **Cloud** presets (OpenAI, Gemini, Claude, OpenRouter, Groq, Together, Mistral, DeepSeek), and any **Custom** OpenAI-compatible API (`https` unless local). You can also connect a loopback-only local MCP server.

Start the local server, load a model, then pick the provider and model in settings. Local servers reject requests from extension pages by default, so Little Later sends its own requests to them with a `127.0.0.1` origin; websites you visit do not get that header.

When you use the assistant, your messages and the records it reads to answer them are sent to the model you chose, wherever that model runs. A model that runs in Ollama or LM Studio on your computer keeps them there. Ollama can also serve cloud models through the same local address (their names end in `-cloud`); with one of those they go to [Ollama's servers](https://docs.ollama.com/cloud). With a custom provider they go to that service under its terms. **Settings → AI** says which of these applies to the selected model and marks cloud models. The assistant can read freely, but creating, changing, deleting or exporting anything needs your confirmation in the chat ([decision 0003](./docs/decisions/0003-ai-writes-need-confirmation.md)). The right-click actions **Note quick summary (AI)** and **Note keypoints (AI)** send only the selected text.

## Development

```sh
bun install
bun run build:shared   # build the shared package once
bun run dev            # then load dist/ in chrome://extensions
```

While `bun run dev` runs, the loaded extension hot-reloads from the dev server. [CONTRIBUTING.md](./CONTRIBUTING.md) covers the end-to-end tests and every check CI runs.

The service worker is the only code that writes data; the popup and the AI send it typed commands ([decision 0012](./docs/decisions/0012-single-writer.md)). Why the project is built the way it is lives in [docs/decisions](./docs/decisions/_index.md), what is being worked on now in [docs/now.md](./docs/now.md), and a map of the code in [AGENTS.md](./AGENTS.md#where-to-read).

## Contributing

Bug reports, ideas and diagnoses are welcome as issues. Pull requests come from the team only; [CONTRIBUTING.md](./CONTRIBUTING.md) explains how to report and how your analysis is credited. Everyone taking part follows the [Code of Conduct](./CODE_OF_CONDUCT.md).

See also: [getting help](./SUPPORT.md), the [security policy](./SECURITY.md) (report vulnerabilities privately, never in a public issue), [how the project is run](./GOVERNANCE.md) and the [changelog](./CHANGELOG.md).

## License

The code is released under the [MIT License](./LICENSE.md).

Little Later is built with [React](https://react.dev), [Vite](https://vite.dev), [Dexie.js](https://dexie.org), [Tailwind CSS](https://tailwindcss.com), [Framer Motion](https://motion.dev) and the [OpenAI SDK](https://github.com/openai/openai-node). Every build includes `THIRD_PARTY_NOTICES.txt` with the license of each bundled package. The Rubik font is under the [SIL Open Font License](./public/fonts/OFL.txt).
