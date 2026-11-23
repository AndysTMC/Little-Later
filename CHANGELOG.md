# Changelog

All notable changes to Little Later are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A change to a stored format or the removal of a feature counts as breaking.

## [Unreleased]

## [3.2.0] - 2026-11-23

### Added

- **Desktop CLI quick-capture & search (`little-later-mcp`):** Search, list, and create notes, tasks (`--due`, `--priority`, `--tag`), reminders (`--at`), and mark tasks done directly from the terminal or launchers via `npx -y little-later-mcp` or standalone release binaries, plus upgrade-safe Native Messaging host installation and auto-reconnect.
- **Portable exports & bookmark import:** Export unlocked notes and saves as Obsidian-ready Markdown (`.md`) with YAML frontmatter, due/recurring tasks and reminders as iCalendar (`.ics`), and saved pages as Netscape Bookmarks (`.html`), and import browser bookmark HTML files via **Settings → Data & Privacy**.
- **Encrypted offline article snapshots:** Save readable article text encrypted alongside saved pages so Little AI and local search can query full page content offline.
- **Auto-hiding bottom navigation bar & expanded pagination:** List views smoothly hide the bottom navigation bar while scrolling down and restore it on slight upward scroll; pagination batch sizes increased to 20 for Saves, History, Search, and Images, and 25 for Notes, Finished Tasks, and Past Reminders.

### Changed

- **Renamed LittleAI to Little AI** across the UI, side panel, and settings, and replaced the Chats overlay drawer with a vertical slide swap below the pinned header (with a consistent `← Back` button and right-aligned history toggle).
- **UI & visual density polish:** Retired the redundant task `Label` field in favor of `#tags` (preserving legacy labels in storage/backups), added inline `High`/`Low` priority badges on task cards, unified Home tag filtering into Search, switched tag input suggestions to type-to-suggest with `Tab` completion, displayed URLs on History cards, fixed 320px side-panel tab truncation, compacted no-preview Save cards, and moved the backup reminder to a subtle bottom strip.
- **Little AI reliability:** Fixed strict OpenAI-compatible turn ordering after confirmed/cancelled tool calls, added `<think>` and code-fence stripping for structured responses on reasoning models, and expanded tool activity labels and confirmation summaries.

### Security

- Stripped saved AI preset API keys (`ai.presets[*].apiKey`) and links pointing from locked notes out of plaintext readable exports.
- Hid the quick `Delete` action on locked note cards until unlocked with the profile password.
- Bound context-menu writes (save image, save quote, note selection) to the originating unlocked profile session, validated image URL protocols and `Content-Length`, escaped Markdown links in saved quotes, blocked detaching task-owned reminders via `link.delete`, and fixed an `autoLock` idle queue race.

## [3.1.0] - 2026-11-22

### Added

- **LittleAI side panel:** A dedicated Chrome side panel (`sidepanel.html`) with background-worker runs, encrypted chat history, an inline model switcher with live search and saved connections, hybrid local retrieval (BM25 + trigrams), and expanded tools (`search_all`, `search_images`, `read_open_tabs`, `link_records`, `unlink_records`, `remember_fact`, `forget_fact`, recurring tasks, and tag filters).
- **Encrypted images vault:** Save images via right-click (**Save image to Little Later**) or upload from the **Images** tab; images are stored encrypted in Dexie v3 with MIME validation, a 10 MB cap, `.lldat` backup round-trip, tagging, and a detail viewer/downloader.
- **Locked notes:** Password-gated notes that require profile password re-verification to view and stay isolated from list previews, Home search, LittleAI, and the external MCP bridge.
- **Cross-record `#tags` and Saves archive:** Add and filter `#tags` across saves, tasks, reminders, notes, and images; archive and unarchive saves with an `Active | Archived` filter; quick **New note** action in the bottom bar; right-click **Save quote to Little Later**.
- **Two-factor unlock:** Optional passkey or security key second factor for unlocking a profile, with single-use recovery codes.
- **Data & Privacy and AI settings:** Dedicated **Data & Privacy** page (AI chat retention, backup reminders, ignored sites/URLs, and opt-in external agent MCP mode), plus **AI Settings** grouped by Local (Ollama, LM Studio, Local vLLM, llama.cpp), Cloud presets, and Custom providers, with connection testing, response style, and AI memories.
- **Local MCP client and external agent bridge:** Opt-in loopback-only Local MCP client for LittleAI (confirmation-gated tool calls) and an opt-in Native Messaging MCP bridge (`packages/mcp-bridge/`) for external agents.

### Changed

- Unified design language and responsive layouts across the popup, full-extension side panel, and LittleAI, with profile accent theming and themed scrollbars (`docs/design.md`).
- Hardened capture, sessions, auto-lock, backups, and reminder notifications, and added real-Chrome extension Playwright tests in CI.

### Security

- Locked notes cannot be read or searched by LittleAI or external MCP clients.
- Local MCP endpoints are restricted to loopback addresses, external MCP access defaults to off (and is stripped on backup import), and `nativeMessaging` is requested only as an optional permission.

## [3.0.1] - 2026-11-04

### Fixed

- The AI assistant no longer stops with an error when a provider replies with a custom tool call; it answers that the tool is not supported.

### Changed

- Updated dependencies, including Vite 8, React Router 8 and the OpenAI client 7.

## [3.0.0] - 2026-10-29

### Changed

- **Breaking:** data is stored in a new encrypted format; data from 2.x is removed on update.
- Every record is encrypted on disk, and only the background worker writes data.
- Backups use `.lldat` format 3 and always need a password; profiles without a password can now export too.
- A task's reminder moves with the task's deadline, and recurring times follow the device to another time zone.
- Requires Chrome 144 or later.
- Releases also attach their signed build provenance as `Little-Later-<version>.intoto.jsonl`.

### Fixed

- The intro page no longer redirects in a loop, and the misc settings page no longer freezes.

## [2.1.1] - 2026-10-28

### Security

- Only the extension's own requests to local AI servers get the trusted `Origin` header; websites no longer do.
- The AI chat, notes and save cards no longer load remote images, links show their host, and notes reach the model as quoted data instead of instructions.
- Locking with a new password asks for it twice, removing a password needs an explicit choice, and deleting a locked profile needs its password.
- An imported backup no longer brings its AI endpoint and key with it, and a custom AI URL must use `https` unless it is on this machine.
- Preview and avatar images can only render as images.

### Changed

- Signed CRX releases, with zip and checksums, are built from version tags.
- CI checks formatting, lint, types, unit tests, the build and the end-to-end suite.
- Release workflow: least-privilege tokens, actions pinned to commit SHAs, tags must be on `main`, and build provenance is attested.
- A release refuses a tag that does not match the version in the manifest and package files, or that has no changelog section, and builds without a dependency cache.

### Added

- Contributing guide, security policy, issue and pull request templates, Dependabot, and this changelog.
- Every build includes `THIRD_PARTY_NOTICES.txt` with the license of each bundled package and the Rubik font, plus a CycloneDX SBOM.
- Releases ship the SBOM and a signed build provenance bundle that can be verified offline; release notes come from this changelog.
- CodeQL, OpenSSF Scorecard, workflow auditing and dependency review run in CI; support and governance docs.

## [2.1.0] - 2026-08-19

### Added

- AI changes to your data need confirmation in the chat.
- Backups use the profile's real lock password.

### Changed

- Visual consistency pass across the popup.

## [2.0.0] - 2026-04-05

### Changed

- Cleanup release.

## [1.0.0] - 2025-10-30

- First release.

[Unreleased]: https://github.com/AndysTMC/Little-Later/compare/v3.1.0...HEAD
[3.1.0]: https://github.com/AndysTMC/Little-Later/compare/v3.0.1...v3.1.0
[3.0.1]: https://github.com/AndysTMC/Little-Later/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/AndysTMC/Little-Later/compare/v2.1.1...v3.0.0
[2.1.1]: https://github.com/AndysTMC/Little-Later/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/AndysTMC/Little-Later/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/AndysTMC/Little-Later/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/AndysTMC/Little-Later/releases/tag/v1.0.0
