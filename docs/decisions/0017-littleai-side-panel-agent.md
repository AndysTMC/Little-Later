---
type: decision
---

# 0017. LittleAI becomes an agent in Chrome's side panel

Status: proposed
Date: 2026-11-19
Deciders: AndysTMC
Supersedes: —
Superseded-by: —

## Context

LittleAI is a chat page inside the toolbar popup. The popup closes whenever it loses focus. That rules out file pickers, the microphone permission prompt, and long runs while the user works on the page beside it. The assistant reads and writes the user's records, but it cannot see or act on pages, keeps no chat history, and supports only Ollama, LM Studio and a custom OpenAI-compatible server.

## Options

- A. Keep the popup and add features around its limits.
- B. Move LittleAI to Chrome's side panel (`chrome.sidePanel`), which stays open beside the page.
- Engine: (1) an agent framework such as LangGraph.js or LangChain.js; (2) the Vercel AI SDK for providers, with Little Later's own agent loop.

## Decision

B with (2).

- **Where:** LittleAI lives in the side panel. The popup keeps everything else and opens the panel. An "AI first" setting (Misc or AI) makes the toolbar icon open the panel directly. The panel then shows Home at its top right instead of Back, and moving between Home and AI runs the other way.
    - **A global panel:** it belongs to the browser window, not to a page. It opens from any tab and stays open, on the same chat, as the user switches tabs. No tab-specific panels.
    - **"This page" is explicit:** a chip in the input names the tab a request will read. It follows the active tab, and the user can remove it or point it at another tab. What the agent reads never depends on where the panel was opened.
    - **The agent's own tab group:** pages the agent opens to read or act on go into a "LittleAI" tab group, never the user's current tab unless the user points it there. The user can watch, collapse or close the group.
    - **Chats belong to the profile, not a window:** a second window's panel, or LittleAI opened in a full tab ("Open in a tab", for long work, without the panel's microphone and file-picker limits), shows the same conversations.
    - **Runs outlive the panel:** an agent run executes in the extension's background, and the panel only shows its progress, so closing the panel doesn't stop a run. Manifest V3 suspends idle background code, so how to keep a long run alive (an offscreen document, a kept-open connection, or resuming from stored state) is tested in phase 1 before it is relied on.
- **Engine:** the AI SDK gives one interface over every provider, with streaming, tool calls, structured output and images. Little Later's own loop keeps its rules as tested code:
    - writes need confirmation (0003);
    - work ends on lock (`src/services/ai/owner.ts`);
    - only the worker writes (0012).

    LangGraph.js is set aside for now: browser support in its 1.x line has hit Node-only dependencies, and its graphs and checkpoints solve problems a single user's local agent does not have. Revisit it if long, resumable multi-agent runs are needed.

- **Providers**, grouped in settings:
    - Local: Ollama (optional API key), LM Studio, Chrome's built-in Gemini Nano.
    - Cloud: OpenAI, Anthropic, Google Gemini, OpenRouter, Ollama Cloud.
    - Custom: any OpenAI-compatible server.

    Keys stay in the profile's encrypted settings, and the privacy notice says where each model runs.

- **Screen:** the input starts in the middle, with suggestions and no large title text, and moves to the bottom after the first message. Chats are kept per profile, encrypted like other records, with a history drawer to search, rename and delete them. The input bar holds attachments, page access, the model picker, the microphone, and Send or Stop.
- **Acting on pages:** every action on a page waits for the user's approval. The page is never asked which actions are risky, and neither is the model: each action asks. The user can stop a run at any time.
    - Each step is listed in the chat: allowed, skipped, or waiting.
    - Reading a page needs the user's permission for that site, the first time in a task.
    - Typing into a password or payment field, uploading a file and downloading one always ask, and no setting removes that.
- **Voice, on the device only:**
    - Speech to text uses the Web Speech API with `processLocally`, after checking that the language pack is installed (`SpeechRecognition.available()` / `install()`). Where it cannot run locally, voice input is off and says why; audio is never sent to a speech service.
    - Spoken replies use only voices with `localService`.
    - The microphone permission is granted once, from an extension page in a tab, because the side panel cannot show the prompt.
- **Open-ended tools:** tools are registered, not hard-coded into the loop, so new capabilities can be added without reworking it. Candidates: connecting MCP servers the user runs, memory the user can see and edit, scheduled runs tied to reminders, research across several tabs into a note, and tab organisation.

## Trade-offs against the charter

- **Local-first:** local providers, on-device voice and Gemini Nano keep everything on the device when the user wants that. Cloud providers are the user's choice, and the notice says where data goes.
- **Security:** approval of every page action keeps the user in control. Per-site page access limits what a prompt injected through a page can reach.
- **Storage:** chats need new encrypted tables, which is a storage schema change (0010) with its own migration.
- **Complexity:** a side panel entry point, a provider layer, page tools with a content script, and the chat store.

## Phases

1. Global side panel, chat history, the new screen and runs in the background, with today's tools.
2. Providers through the AI SDK, and settings grouped as Local, Cloud and Custom.
3. Files and folders, and reading pages.
4. On-device voice in and out.
5. Acting on pages, with approval of every step.

## Rollback

Each phase ships behind the previous one. The popup chat remains until phase 1 is accepted.

## How to verify

- Unit tests for the loop's rules: confirmation, lock, approval of every page step.
- Extension tests for the side panel, chat storage and page tools.
- Hand tests in real Chrome by Codex (`artifacts/qa-checklist.md`) for the microphone, the side panel and real pages.

## Revisit if

Chrome adds an extension API for the browser's own AI agent features, or the side panel API changes.
