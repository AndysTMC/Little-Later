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

- **Where:** two surfaces, each with one job.
    - **The popup is Little Later's home.** The toolbar icon opens it, as before. It holds everything except the AI chat: Home (saves, tasks, reminders, notes), History, creating records, Settings, the profile, and lock and unlock. It suits quick work and closes when the user clicks away.
    - **The side panel is LittleAI, and only LittleAI.** It opens from the popup's AI button (the popup then closes), from Chrome's own side panel menu, and optionally from a keyboard shortcut or a right-click "Ask LittleAI" on a page. It holds the chat, the chat history, the "this page" chip and agent runs, and "Open in a tab" for long work. It has no Home, Settings or profile screens. It stays open beside the page, so long answers and runs survive the user's clicks, and the popup's limits on file pickers and the microphone don't apply.
    - **Locked:** the panel holds no copy of the unlock screens. It says the profile is locked, with a button that opens the popup to unlock it.
    - **No "AI first" setting:** the popup's AI button (or a shortcut) is how LittleAI opens.
        - **A global panel:** it belongs to the browser window, not to a page. It opens from any tab and stays open, on the same chat, as the user switches tabs. No tab-specific panels.
        - **"This page" is explicit:** a chip in the input offers the active tab and follows it as the user switches tabs. Tapping the chip attaches that page, at that address, to the next message, and that tap is the permission to read it. Sending, ×, or leaving the page (another tab, or the tab moving to another address) takes it off. Nothing is read from a page the user didn't attach, and what the agent reads never depends on where the panel was opened.
        - **Reading an attached page:** the worker reads the tab's title, address, selected text and main text with `chrome.scripting`, only while the tab still shows the attached address. The selection comes first, and the two share one budget of 15,000 characters; the model is told when some was left out. Only the latest attached page's text stays in the conversation. The model gets it marked as the web's content, which it must not follow as instructions. The chat stores only the page's title and address with the message, as a link.
        - **The agent's own tab group:** pages the agent opens to read or act on go into a "LittleAI" tab group, never the user's current tab unless the user points it there. The user can watch, collapse or close the group.
        - **Chats belong to the profile, not a window:** a second window's panel, or LittleAI opened in a full tab ("Open in a tab", for long work, without the panel's microphone and file-picker limits), shows the same conversations.
        - **Runs outlive the panel:** an agent run executes in the service worker (`src/services/ai/runs.ts`, commands `ai.*`), and the panel only shows its progress, so closing the panel doesn't stop a run. One run per chat; while it runs, a light extension call every 20 seconds keeps the worker from being suspended. The run's stage, steps and streamed draft live in `chrome.storage.session` (`ai:run:<chatId>`), so a reopened panel picks the run up where it is. The conversation is rebuilt from the stored chat whenever the worker restarts, or the AI settings change, so a chat always goes to the provider set up now. Its earlier messages go with it: choosing a provider is choosing where the chat continues. A run ends with the unlock it started under. A run that Chrome stops anyway is stored as interrupted when the worker starts again, with the steps it had finished.
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

- **Screen:** the input starts in the middle, under a one-line greeting and above a few suggestions, and moves to the bottom after the first message. Chats are kept per profile, encrypted like other records, with a history drawer to search, rename and delete them. The input bar holds the page chip, the model (which opens AI settings), and Send or Stop; attachments and the microphone join it in later phases.
    - **Answers stream** as the model writes them. Each answer lists the tools it used, folded into one line ("Searched tasks", "Used 3 tools").
    - **What LittleAI waits on docks above the input:** a question it asks (the `ask_user` tool: two to five options, and "Something else…" to type an answer), or changes to approve. Options are numbered and answer to their number keys. While the box is open the conversation doesn't repeat it; once answered, the conversation keeps a short record.
    - **Taking a message back:** Edit (or ↑ in an empty input) rewrites the last message, and Regenerate asks it again. The worker checks the new message, then replaces that message and what followed in one step, so a refused edit changes nothing. Esc stops a run.
    - The panel has its own compact controls (`src/panel/ui.tsx`) rather than the popup's, since a chat is denser than a form.
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
- **Storage:** chats need new encrypted tables, `chats` and `chatMessages`, which is a storage schema change (0010): database version 2 adds them, and older data needs no migration. Chats are in the importable backup and the readable export. A message the user sends is at most 100,000 characters and an answer at most 1,000,000 (a longer one is shortened, saying so); the backup importer accepts the same.
- **Complexity:** a side panel entry point, a provider layer, page tools with a content script, and the chat store.

## Assumptions

- Chrome's `chrome.sidePanel` API and MV3 service worker keep-alive behaviour remain stable across supported Chrome versions.
- Users understand that switching AI providers sends prior messages of the active chat to the newly selected provider.

## Phases

1. Global side panel, chat history, the new screen and runs in the background, with today's tools. Built with streaming, questions, edit and regenerate, and reading a page the user attaches (brought forward from phase 3).
2. Providers through the AI SDK, and settings grouped as Local, Cloud and Custom.
3. Files and folders, and reading pages.
4. On-device voice in and out.
5. Acting on pages, with approval of every step.

## Rollback

Each phase ships behind the previous one. Phase 1 removed the popup's chat page; rolling it back means restoring that page and its route and taking the side panel out of the manifest. Stored chats stay readable either way.

## How to verify

- Unit tests for the loop's rules: confirmation, lock, approval of every page step.
- Extension tests for the side panel, chat storage and page tools.
- Hand tests in real Chrome for the microphone, the side panel and real pages.

## Revisit if

Chrome adds an extension API for the browser's own AI agent features, or the side panel API changes.
