---
type: decision
---

# 0012. We will make the service worker the only writer, through typed commands

Status: proposed
Date: 2026-10-28
Deciders: AndysTMC
Supersedes: —
Superseded-by: —

## Context

The popup, the AI tools and the service worker all write to IndexedDB directly. Eight service modules call `db.*Tbl.add/put/update/delete`, including `src/services/ai/toolRegistry.ts`. This causes three problems:

- **Races:** capture in the worker and saves in the popup can race on the same URL (A25).
- **Missing transactions:** changes that span tables, such as deleting a save with its notes and links, do not always run in one transaction (A13).
- **Separate AI path:** the AI writes through code the UI does not use.

With per-record encryption (decision 0010), every writer would also need the validation and encryption rules, which multiplies the places that can get them wrong.

## Options

- A. **Keep many writers** and add the missing transactions. This is the least work, but the races and the duplicated rules remain.
- B. **The service worker owns every write.** Pages and the AI send typed commands. The worker validates them, encrypts and writes. Reads stay in each page, through live queries and a decrypting repository.
- C. **The popup owns writes.** The popup is often closed, so capture and alarms would have nowhere to write.
- D. **Many writers coordinated by Web Locks.** This serializes access, but every writer still carries the validation and encryption code.

## Decision

Option B.

**Commands**

- One module defines each write as `{ name, input schema, handler }`, for example `save.capture`, `save.update`, `note.create`, `task.complete` and `profile.lock`.
- Cascades live in the handler, not in its callers. Deleting a save removes its notes, links and assets.
- AI tools are built with `defineTool` on these same commands. Anything the AI can do, the UI can do too, and the AI's confirmation step (decision 0003) stays in the UI, before the command is sent.

**Transactions**

- A handler first validates its input, then computes every ciphertext and HMAC. Only then does it open one Dexie transaction, which contains reads and writes and nothing else.
- WebCrypto calls are never awaited inside a transaction, because that would commit it early.
- De-duplication is enforced by a unique compound index `&[profileId+urlKey]`, not by reading before inserting. This removes the capture-and-save race.

**Messaging**

- Pages call `send(command, input)`, a typed wrapper over `chrome.runtime.sendMessage`. It returns the handler's result or a typed error.
- Messages carry JSON only.
- Binary input never crosses the message: avatars, images and backup files. The page writes the bytes to a staging file in the origin private file system (OPFS) and sends the file's name. The worker reads the file, deletes it, and sweeps leftovers at start-up.
- The worker accepts a message only when `sender.id` equals `chrome.runtime.id` and `sender.url` is on the extension's own origin.
- Commands that can be retried are idempotent: deleting a row that is already gone succeeds. A worker that is shut down mid-reply can make a page retry.

**Long work**

- Import, export, re-keying and bulk delete each run as a job with a cursor saved in the database.
- Each chunk is its own transaction and finishes well within Chrome's per-event limits. A job left unfinished resumes when the worker next starts.
- The page that started the job holds a port open for progress, which also keeps the worker awake.

**Reads**

- Pages read with Dexie `liveQuery` through a repository that decrypts rows (0010), and they hold the subkeys to do so.
- So the single writer protects how data is written and validated. It does not keep keys out of pages.
- Pages never import table write methods; a lint rule forbids writes outside `src/background/`.

## Trade-offs against the charter

- **Reliability:**
    - Each user action is one transaction.
    - There are no races between contexts.
    - Cascades live in one place.
    - Long jobs survive the worker shutting down.
- **Security:**
    - One place validates input and encrypts.
    - The AI cannot reach a write that the UI lacks.
    - Sender checks keep future content scripts out.
- **Performance:**
    - A write costs a message round trip: about a millisecond when the worker is awake, more when it has to start.
    - Binary input adds one OPFS write and read.
    - Reads are unaffected.
- **Maintainability:**
    - One command registry replaces eight write paths.
    - Handlers are plain functions over a database and a clock, so they can be tested without a browser.

## Rollback

- **Before release:** revert the PR.
- **After release:** module by module, the command layer can be bypassed without changing any data, because it alters no stored format.

## How to verify

- **Handler tests**, run against fake-indexeddb, for every command, including cascades, idempotent deletes and a job resuming from its cursor.
- **A race test:** capturing and saving the same URL at the same time produces one save.
- **A CI test** showing that a write made by the worker reaches a page's `liveQuery`.
- **A messaging test:** a 10 MB image goes through OPFS staging, and messages with the wrong sender are rejected.
- **A lint rule** fails the build when code outside `src/background/` writes to a table.
- **The e2e suite** passes on the new path.

## Assumptions

- [A1] A message wakes a sleeping MV3 service worker and is delivered. One event may run for up to 5 minutes, and the worker stops after 30 seconds without events. Revisit if Chrome changes worker lifetime rules.
- [A2] Dexie 4 forwards changes made in the worker to `liveQuery` in pages, through BroadcastChannel on the same origin. This is checked by the CI test above.
- [A3] OPFS is available to the worker and to extension pages, and they share it on the extension's origin. Revisit if it is not; the fallback is base64 in messages under the 64 MiB limit.

## Consequences

- `src/services/*` splits in two:
    - read repositories, usable in any context;
    - command handlers, run only in the worker.
- The worker splits into capture, scheduler, menus, commands and jobs modules.
- AI tool definitions move to one file per tool, built on `defineTool`.

## Review

An independent agent critiqued the first draft. Adopted:

- No WebCrypto awaits inside transactions.
- De-duplication by a unique index.
- OPFS staging for binary input, because runtime messages are JSON.
- Resumable jobs for long work.
- The corrected claim about which contexts hold keys.
- Stronger sender checks.
- The `liveQuery` check moved into CI.

## Revisit if

Writes need to happen while the worker cannot run, or a sync engine becomes the writer.
