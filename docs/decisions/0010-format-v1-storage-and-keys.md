---
type: decision
---

# 0010. We will encrypt each record under a wrapped profile key, in one versioned database

Status: accepted
Date: 2026-10-28
Deciders: AndysTMC (accepted 2026-10-28: "Got it, I accept it. Go ahead.")
Supersedes: —
Superseded-by: —

## Context

Today a profile's data lives in the `LLDB` Dexie database in plain form while the profile is unlocked. Locking serializes every table, encrypts the snapshot with a key derived from the password (PBKDF2-SHA256, 100,000 iterations), writes it to `userVaultTbl` and clears the tables; unlocking does the reverse (`src/services/user.ts`, `packages/shared/src/utils/crypto.ts`). Decision 0002 records this single-unlocked-vault model, and 0004 the backup rules. Their costs, from the October 2026 review:

- While unlocked, everything is plain text on disk.
- Lock and unlock copy the whole profile through memory several times, so a large profile is slow to lock and can run out of memory (A10, A25).
- A password change re-encrypts everything, and there is no instant or automatic lock (A9).
- Stored blobs carry no magic bytes, version or KDF parameters, so the format cannot evolve safely (A17, A21).
- Reminders cannot fire while locked, because their times are inside the vault.

There are no users yet (AndysTMC, 2026-10-27), so schema and formats may change, and no importer for v2.x data is needed. This record defines storage format v1. Decisions 0011 (time model) and 0012 (single writer) land in the same migration.

## Options

- A. **Keep the vault swap** and add a versioned header and a stronger KDF. Smallest change; keeps plain text at rest while unlocked, the lock memory spike, and no reminders while locked.
- B. **Encrypt each record's content under a per-profile key, keep only index and scheduling metadata plain.** A random root key encrypts content; a password-derived key wraps it; lock drops the unwrapped key. Every read decrypts.
- C. **Store everything plain and make the lock a UI gate.** Simplest and fastest, but "locked" would protect nothing against anyone who can read the browser profile.
- D. **Use an encryption add-on for Dexie** (for example `dexie-encrypted`). Less code, but a little-maintained dependency with its own format and no say over which fields stay indexable.

## Decision

Option B.

### Database

- One Dexie database named `little`, created at format v1. `LLDB` is deleted on first run of the new version.
- Every row carries `profileId`, and every index leads with it.
- Ids are random UUIDs.
- Dexie versions are numbered migrations from here on, each with a golden fixture.
- One profile is unlocked at a time, which keeps 0002's "one current profile" rule.

### What stays plain, and therefore leaks to anyone who copies the browser profile

- Per profile: the profile's name and avatar (the lock screen shows them), the KDF parameters, the wrapped keys, and non-sensitive preferences the locked worker and lock screen need (theme, auto-lock minutes).
- Per record:
    - `id` and kind;
    - `createdAt`, `updatedAt`, due and next-fire instants;
    - status flags (done, saved, browsed);
    - the privacy label (`private` or `public`, default `private`);
    - the recurrence rule and escalation settings, so reminders keep firing while locked (0011);
    - `urlKey` and `originKey`, HMAC-SHA-256 values of the normalized URL and of its origin under the profile's index key. `originKey` keeps the per-site history limit (`VBMSameOriginLimit`, `src/services/visualBM.ts`) an index count instead of a scan that decrypts every unsaved row.
- Size: ciphertext length shows how large a page text, note or preview is.

Together these give a timeline of saves and browsing, how often each kind of record is created, repeat visits to the same URL (equal `urlKey`), and which records share a site (equal `originKey`), but not the titles, URLs, text or images themselves.

### What is encrypted

- Every content field of a row (titles, URLs, page text, note bodies, reminder messages, task text) goes into one `body` value.
- Sensitive settings (AI provider, base URL, API key, model) live in an encrypted per-profile settings row, not in `chrome.storage.local`.
- Every binary asset (previews, saved images) goes into an `assets` table.

### Envelope

- Layout: `magic "LLE" | format version (1 byte) | key id (1 byte) | IV (12 random bytes) | AES-256-GCM ciphertext`, over a MessagePack payload.
- The additional authenticated data is the header bytes plus `table | id | profileId | field`, so a ciphertext cannot move to another row, field, profile or format.
- At personal scale, a random IV stays far below the about 2^32 messages one key may encrypt.

### Keys

- Each profile has a random 32-byte root key with a key id (starting at 1). HKDF-SHA-256 derives separate content and asset subkeys from it.
- Each profile also has a random 32-byte index key for `urlKey` and `originKey`. It is stored wrapped under the current root key and does not change when the root key does, so re-keying never rewrites index values or breaks the unique index.
- **Password-protected profile.**
    - The profile row holds only the root key wrapped with AES-GCM under a key derived by PBKDF2-SHA-256: 600,000 iterations and a 16-byte salt.
    - The wrap's additional data binds `profileId`, key id, KDF name, iterations and salt, so stored parameters cannot be swapped.
    - A wrong password fails the GCM tag. Testing passwords this way needs a copy of the profile, which is the offline guessing the KDF already prices in.
- **Profile without a password.**
    - The root key is stored unwrapped, and the UI labels the profile "not encrypted at rest". This replaces the `EMPTY_PASSWORD` sentinel.
- **Unlocking.**
    - The root key bytes go into `chrome.storage.session`. It is held in memory, at the default `TRUSTED_CONTEXTS` access level, which content scripts cannot read. The code never calls `setAccessLevel`, and a test asserts the level.
    - Each context reads the bytes once, imports non-extractable subkeys, and keeps no raw copy.
    - The extension's own pages decrypt reads (0012), so they hold the subkeys too.
- **Re-keying.**
    - Creates root key k+1, wraps it (and re-wraps the index key) next to key k on the profile row, and puts both in session storage.
    - New writes use key k+1; a job re-encrypts rows under key k in chunks (0012) and runs only while the profile is unlocked.
    - When no row uses key k, the job deletes key k from the profile row and session storage.
- **Password change** re-wraps the 32-byte root key. Forgetting the password loses the data; there is no recovery key in v1.
- **Deleting a profile** deletes its wrapped key first, which makes the data unreadable at once (crypto-shredding), then removes the rows.

### Locking

- Lock removes the key from `chrome.storage.session`. Every open page listens to `storage.session.onChanged`, drops its subkeys, and clears decrypted state and live-query results.
- **Automatic lock.** The profile locks:
    - at browser start, and when the extension is updated or reloaded, because Chrome clears session storage then;
    - when the screen locks (`chrome.idle` state `locked`);
    - after 30 idle minutes, configurable per profile with Chrome's 15-second minimum.
- **While locked:**
    - Reminders fire from their plain schedule and show "Unlock Little Later to see this reminder".
    - Automatic captures are skipped; nothing is written without the key.

### Backups (`.lldat` format 3; supersedes 0004)

- Every backup is protected by a password chosen at export. It defaults to the profile's password and is required for passwordless profiles, so 0004's refusal to export those profiles is lifted.
- The header holds magic `"LLDAT"`, the format version, KDF name, iterations and salt.
- The body is the profile's rows, decrypted and re-encrypted in chunks under a fresh backup key that the backup password wraps.
- Import:
    - unwraps the backup key;
    - creates a new profile with new root and index keys;
    - maps every old id to a new UUID derived from an HMAC of the old id under a random per-import seed, so links, task-reminder pairs and assets keep pointing at the right rows across chunks without an id map in memory;
    - recomputes `urlKey` and `originKey` under the new index key and re-encrypts each row, so two imports of one backup never share keys or collide;
    - resets the AI provider, base URL, API key and model to defaults, as decision 0007 (A16) requires;
    - runs while the import page is open; if the worker stops or the profile locks first, the half-imported profile is deleted and the user retries.
- Readable JSON export decrypts and strips API keys, as today.

### Search

Search decrypts in memory at query time. A full-text or semantic index is a later decision, and it must be encrypted the same way.

## Trade-offs against the charter

- **Security and privacy:**
    - Content is encrypted at rest whether the profile is open or not, and lock is instant and automatic.
    - The plain metadata listed above stays readable to anyone with a copy of the profile.
    - Deleting `LLDB` does not immediately scrub old plain text from LevelDB files on disk. With no users yet, this matters little.
- **Performance:**
    - Each read decrypts one row with AES-GCM, which takes microseconds.
    - Lock is constant time.
    - Unlock costs one key derivation of under a second, plus decrypting what the first screen shows.
    - Search decrypts every row of the kinds it searches.
- **Reliability:**
    - No bulk copy at lock, so no out-of-memory failure there.
    - The wrapped key is written in the same transaction as its profile row and covered by fixtures, because losing it loses the profile.
- **Maintainability:** one crypto module and one envelope replace the vault serializer, and every read path goes through a decrypting repository (0012).
- **Usability:**
    - Password changes are instant.
    - Reminders work while locked.
    - Passwordless profiles are honest about their protection.
    - An extension update locks open profiles, which users will notice.
- **Permissions:** adds `idle`, which shows no install warning.

## Rollback

- **Before release:** revert the PR. Nothing has been stored yet.
- **After a release that ships format v1:** older builds cannot read `little`, so a rollback is a new format version (a forward migration), never a downgrade.
- **Backups:** format 3 backups stay importable by every later build.

## How to verify

- Unit tests for:
    - the envelope: round trip, wrong key, tampered header or AAD, wrong magic or version;
    - wrap and re-wrap, including swapped KDF parameters failing;
    - HKDF subkey separation;
    - URL normalization and the URL key;
    - the session access level;
    - crypto-shred on delete.
- Golden fixtures of a format-v1 database and a `.lldat` format-3 file, imported and compared field by field in CI.
- An end-to-end test:
    - lock, check that content is unreadable, that an open popup clears itself, and that a reminder fires with the generic text;
    - unlock;
    - import the same backup twice and get two independent profiles.
- Performance tests in CI:
    - unlock plus first render under 1.5 s;
    - search over 5,000 records under 200 ms.

## Assumptions

- [A1] `chrome.storage.session` is in memory only, defaults to `TRUSTED_CONTEXTS`, and is cleared on browser restart and on extension update or reload. Revisit if Chrome changes the default or its lifetime.
- [A2] WebCrypto offers PBKDF2, HKDF, HMAC and AES-GCM in the service worker and pages, but not Argon2. Revisit if Argon2 lands in WebCrypto; the stored KDF field allows a switch.
- [A3] 600,000 PBKDF2-SHA-256 iterations take under a second on a typical laptop. This gets measured during implementation and is lowered only with a recorded reason.
- [A4] The metadata leakage listed above is acceptable, because the threat is someone reading a copied browser profile in a personal tool. Revisit if sync, sharing or a multi-user mode is added.

## Consequences

- When this is accepted and shipped, it supersedes 0002, 0004 and 0005 (settings move from `chrome.storage.local` into the profile row and the encrypted settings row; the active profile lives in `chrome.storage.session`).
    - Their records get `Superseded-by: 0010` in a separate change labelled `human-edited`; their bodies stay as written.
    - Decision 0007's import reset (A16) carries over unchanged.
    - The rule of one unlocked profile at a time carries over.
- The service worker and pages never hold decrypted content outside a repository that drops it on lock.
- Every new table states which of its fields are plain, and why.

## Review

An independent agent critiqued the first draft. Adopted:

- **Backups:** import re-keys into a fresh profile with new ids, instead of copying rows, which broke the AAD and shared keys between profiles.
- **Leakage:** the list is complete, including sizes, timeline, profile name and avatar, and the plain recurrence rule.
- **Authenticated data:** the AAD binds the header and field, and the wrap's AAD binds the KDF parameters.
- **Keys:**
    - key ids get a re-key procedure;
    - the session access level is asserted, and pages keep only non-extractable subkeys;
    - the statement that only the worker holds keys was corrected.
- **Locking:**
    - extension updates lock profiles;
    - lock reaches open pages, and screen lock triggers it;
    - only one profile is unlocked at a time;
    - deleting a profile crypto-shreds it;
    - captures are skipped while locked.
- **Decision 0004** is superseded openly.
- **Performance targets:** they measure unlock and search, not lock.

A second review (AndysTMC, 2026-10-28) found gaps where this record meets 0012 and the current code. Adopted:

- An upsert resolves the existing row's id before encrypting (see 0012).
- Re-keying keeps both root keys until it finishes, and a separate index key keeps `urlKey` stable.
- Import derives new ids from the old ones under a per-import seed, recomputes index values, and keeps 0007's AI reset.
- Superseding 0005, and plain non-sensitive preferences on the profile row.
- `originKey`, so the per-site history limit survives URL encryption.

Not adopted: padding ciphertexts to size buckets, which can come later if size leakage matters, and encrypting captures to a public key while locked.

## Revisit if

- Sync or sharing is added, which changes how much the plain metadata exposes.
- A full-text index is added; it must be encrypted.
- Chrome ships a key store that holds non-extractable keys across extension contexts.
