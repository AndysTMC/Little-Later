# 0004. Importable `.lldat` uses the real lock password; passwordless profiles cannot export importable bundles

Status: accepted
Date: 2026-08-19
Deciders: existing project
Supersedes: —
Superseded-by: —

## Context

Importable backups (`.lldat`) wrap vault bytes. An empty password or a fallback constant would make those files decryptable by anyone who has the file.

## Options

- A. Require the profile's real lock password; refuse passwordless export
- B. Allow empty / `LEMPTY_PASSWORD` so passwordless profiles can export
- C. Invent a separate backup password

## Decision

`createImportableExportBlob` and import require the current lock password. Empty strings and `LEMPTY_PASSWORD` are rejected. Passwordless profiles must set a lock password before they can make an importable backup. Readable JSON export stays a separate, redacted path.

## Assumptions

- [A1] Users who want a portable encrypted backup are willing to use a lock password
- [A2] Old `.lldat` files that used an empty or fallback password are not a compatibility requirement

## Consequences

UI and AI export tools must surface the lock-password requirement. Do not reintroduce a default backup passphrase.

## Revisit if

A migration must read historical empty-password `.lldat` files, or a separate backup-password product is requested.
