# 0006. Extension signing keys live only outside git

Status: accepted
Date: 2026-08-19
Deciders: existing project
Supersedes: —
Superseded-by: —

## Context

A self-hosted `.crx` needs a stable RSA private key so the Chrome extension ID stays the same across releases. A previous key appeared in git history and is treated as burned. A new key is stored as the GitHub Actions secret `SIGNING_KEY`.

## Options

- A. Keep the private key only in Actions secrets; CI signs the CRX
- B. Commit a PEM in the repo (rejected)
- C. Ship zip-only releases with no CRX

## Decision

The private key never enters the tree. Release packaging reads `SIGNING_KEY`, injects the derived public `key` into the built `dist/manifest.json` so zip and CRX share an ID, writes `Little-Later-<version>.crx`, and uploads it with the zip and checksums. `*.pem` and `*.crx` stay gitignored.

## Assumptions

- [A1] `SIGNING_KEY` is an RSA PEM (PKCS#1 or PKCS#8) of at least 2048 bits, or base64 of that PEM
- [A2] A new extension ID after key rotation is acceptable
- [A3] Unpacked zip remains the supported install path where Chrome blocks sideloaded CRX files

## Consequences

A release tag without `SIGNING_KEY` must fail. Do not print the secret in logs. Do not reuse the burned key.

## Revisit if

The extension is published to the Chrome Web Store (store-assigned ID), or the secret is rotated again.
