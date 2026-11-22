---
type: decision
---

# 0018. Images vault, locked notes, and opt-in local MCP bridge

Status: proposed
Date: 2026-11-22
Deciders: AndysTMC
Supersedes: —
Superseded-by: —

## Context

Users save visual references from the web alongside bookmarks, tasks, reminders, and notes; keep sensitive notes that should stay hidden behind password re-authentication even while a profile is unlocked; and want local external agents (such as desktop coding assistants or CLI tools) to read or update an unlocked vault without introducing a cloud backend.

All three capabilities touch storage, encryption boundaries, or extension permissions and therefore need clear invariants that preserve decisions 0001 (extension-only and local-first), 0003 (AI writes require confirmation), 0010 (per-record encryption under the profile key), and 0012 (the service worker is the single writer).

## Options

- A. Store images inside notes as base64 data URLs, rely solely on profile lock for sensitive notes, and expose an unauthenticated localhost HTTP server from the extension.
- B. Add a dedicated Dexie v3 `images` table backed by encrypted binary `assets`, add per-note password-gated locking (`locked: true`) isolated from search and AI, and expose an opt-in Chrome Native Messaging MCP bridge (`packages/mcp-bridge`) alongside a loopback-only local MCP client for LittleAI.

## Decision

B.

- **Images vault (Dexie v3):**
    - Add an additive `images` table (`id, [profileId+updatedAt], [profileId+keyId]`) sealed under the profile key like other records, with binary image payloads stored in the existing encrypted `assets` table (`kind: "image"`).
    - Enforce an explicit raster MIME allowlist (`image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/avif`; never `image/svg+xml`), a 10 MB payload ceiling, and `http(s)`-only `sourceUrl` validation in `src/background/commands/images.ts`.
    - Reuse the shared `/pick-file` upload screen (`LUIFileInput`) for adding images so toolbar popups (paste/drop) and side panels or tabs (paste/drop/file browse) share one consistent flow, complemented by right-click "Save image to Little Later".
    - Include `images` and their encrypted assets in importable `.lldat` backups and cascade deletion.

- **Locked (secure) notes:**
    - Notes can opt into `locked: true` only on password-protected profiles.
    - Opening a locked note requires fresh password verification (`profile.verifyPassword`) held only in component memory, never persisted to session drafts, and immediately cleared when leaving the screen.
    - Locked note bodies are never rendered in list previews, never indexed in plain Home search, and unconditionally filtered out before LittleAI (`src/services/ai/records.ts`) or external MCP (`src/background/mcpBridge.ts`) reads or mutates notes.

- **Local MCP client & external agent Native Messaging bridge:**
    - **LittleAI as MCP client (`src/services/ai/mcpClient.ts`):** optionally connects to a user-configured Streamable HTTP MCP server restricted strictly to loopback addresses (`localhost`, `127.0.0.1`, `[::1]`). External tools are namespaced (`mcp__*`) and every call requires explicit in-chat user confirmation (`kind: "external"`).
    - **External agents accessing Little Later (`src/background/mcpBridge.ts`, `packages/mcp-bridge/`):** disabled by default (`externalMcpMode: "off"`), controlled under Settings -> Data & Privacy (`Off`, `Read-only`, `Read & write`), using Chrome's `"optional_permissions": ["nativeMessaging"]` and a user-private (`0600`) local IPC socket.
    - The bridge refuses every request while the profile is locked, rejects write tools unless `externalMcpMode === "write"`, routes all writes through the service worker command dispatcher, resets `externalMcpMode` to `"off"` on backup import, and never exposes vault keys, passwords, AI API keys, or locked notes.

## Consequences

- Existing format v1 databases upgrade seamlessly to Dexie v3 without migrating prior rows, and golden format 3 backups remain backward-compatible because new metadata fields (`tags`, `archived`, `locked`, `misc.*`) are stored sparsely.
- Users who never enable external MCP receive no extra install-time permissions and no background native host traffic.
- Locked notes remain protected against accidental screen exposure, plain search, LLM data exfiltration, and external MCP agents while the profile is unlocked.
