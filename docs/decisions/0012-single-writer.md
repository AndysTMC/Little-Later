---
type: decision
---

# 0012. We will make the service worker the only writer, through typed commands

Status: accepted
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

- The worker runs commands one at a time through an in-memory queue. A command's reads, WebCrypto work and transaction together are atomic with respect to other commands, so two updates to the same encrypted `body` cannot overwrite each other. Long jobs yield to the queue between chunks.
- A handler validates its input, reads what it needs (for an upsert, the existing row's id through `[profileId+urlKey]`), computes every ciphertext and HMAC with that id in the AAD (0010), and only then opens one Dexie transaction that contains reads and writes and nothing else.
- WebCrypto calls are never awaited inside a transaction, because that would commit it early.
- A unique compound index `&[profileId+urlKey]` backs de-duplication. With the queue it should never fire; if it does, the command fails loudly instead of creating a duplicate. Together they remove the capture-and-save race.

**Messaging**

- Pages call `send(command, input)`, a typed wrapper over `chrome.runtime.sendMessage`. It returns the handler's result or a typed error.
- Messages carry JSON only.
- Binary input never crosses the message: images, avatars and backup files. The page writes the bytes to a staging file in the origin private file system (OPFS) and sends the file's name. The worker reads the file, deletes it, and sweeps leftovers at start-up and at unlock.
- OPFS is persistent disk, so content never enters it in plain form. The page encrypts the bytes before writing, as an envelope (0010) under the profile's asset subkey, with additional data `staging | file name | profileId`. The staging key therefore lives exactly as long as the unlock: a file left behind by a closed page, a crash or a lock is ciphertext that only the same profile's next unlock can read, and the sweep deletes it then.
- Two inputs are staged as they are: a `.lldat` backup, which is already encrypted under its backup password, and a profile avatar, which 0010 keeps plain for the lock screen.
- The worker accepts a message only when `sender.id` equals `chrome.runtime.id` and `sender.url` is on the extension's own origin.
- Commands that can be retried are idempotent: deleting a row that is already gone succeeds. A worker that is shut down mid-reply can make a page retry.

**Long work**

- Re-keying and bulk delete run as jobs with a cursor saved in the database. Each chunk is its own transaction and finishes well within Chrome's per-event limits. An unfinished job resumes the next time its profile is unlocked, because it needs the profile's keys.
- Import and export are tied to an open page, a backup password and a file. They are not resumed: if the worker stops or the profile locks, a half-done import is deleted, the staging files are swept, and the user retries.
- Since Chrome 114, an open port alone does not keep the worker alive; only messages do. So a job's page sends a heartbeat on its port every 20 seconds, the worker posts progress after every chunk, and a chunk is sized to finish within 10 seconds. If the port disconnects, the worker finishes the current chunk and then treats the job as interrupted.
- An import writes a job record (`kind: import`, `profileId`, `state: running`) before its first chunk and marks it done after the last. At every worker start, an import job still `running` means the worker died mid-import: its half-built profile and its staging files are deleted, so cleanup never depends on the page that started it.

**Development and tests**

- Under `bun run dev`, unit tests and the screenshot runner, there is no service worker. `src/utils/chrome.ts` keeps its non-production fallback and adds one for `send`, which calls the same command handlers in memory, and one for `chrome.storage.session`, which uses memory.
- The Playwright e2e suite moves to the built extension loaded in Chromium with `--load-extension`, so the real worker, messaging and session storage are tested.

**Reads**

- Pages read with Dexie `liveQuery` through a repository that decrypts rows (0010), and they hold the subkeys to do so.
- So the single writer protects how data is written and validated. It does not keep keys out of pages.
- Pages never import table write methods; a lint rule forbids writes outside `src/background/`.

## Trade-offs against the charter

- **Reliability:**
    - Each user action is one transaction.
    - There are no races between contexts.
    - Cascades live in one place.
    - Re-keying and bulk deletes survive the worker shutting down.
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
- **A race test:** capturing and saving the same URL at the same time produces one save, and two quick updates to one record keep both changes.
- **A CI test** showing that a write made by the worker reaches a page's `liveQuery`.
- **A messaging test:** a 10 MB image goes through OPFS staging, and messages with the wrong sender are rejected.
- **Staging tests:** locking, or killing the worker, between staging and command delivery leaves only ciphertext in OPFS, which the next unlock sweeps.
- **Job tests:** an import killed mid-way is rolled back at the next worker start; a job whose page stops sending heartbeats is marked interrupted.
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

An independent review of the first draft led to these changes. Adopted:

- No WebCrypto awaits inside transactions.
- De-duplication by a unique index.
- OPFS staging for binary input, because runtime messages are JSON.
- Resumable jobs for long work.
- The corrected claim about which contexts hold keys.
- Stronger sender checks.
- The `liveQuery` check moved into CI.

A third review (2026-10-28) found two gaps. Adopted: staging files are encrypted before they reach OPFS, and jobs keep the worker alive with heartbeat and progress messages instead of an idle port, with a durable job record so a crashed import is cleaned up.

A second review (2026-10-28) found more. Adopted:

- A command queue in the worker, so commands that read, encrypt and write do not lose each other's updates.
- Upserts resolve the existing id before encrypting.
- Jobs resume only when the profile is unlocked; import and export roll back instead of resuming.
- A development fallback for `send` and session storage, and e2e against the built extension.

## Revisit if

Writes need to happen while the worker cannot run, or a sync engine becomes the writer.
