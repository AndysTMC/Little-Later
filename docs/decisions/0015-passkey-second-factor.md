---
type: decision
---

# 0015. A passkey or security key can be a second factor for unlocking

Status: proposed
Date: 2026-11-18
Deciders: AndysTMC
Supersedes: —
Superseded-by: —

## Context

A protected profile's root key is wrapped by a key derived from its password (decision 0010). Anyone who learns the password and has the browser profile can open it. A second factor should make the password alone not enough.

Little Later has no server, so the second factor has to take part in the key itself. A check that only gates the unlock screen protects nothing: the encrypted data and everything needed to pass the check sit on the same disk.

## Options

- A. An authenticator-app code (TOTP). Its shared secret would be stored next to the data it protects, so it adds a prompt and no protection.
- B. A passkey or security key instead of the password. Convenient, but still one factor.
- C. A passkey or security key together with the password. The WebAuthn PRF extension (`hmac-secret` on security keys) returns a secret that only that authenticator can produce. The root key is wrapped by a key derived from both the password and that secret, so both are needed.

## Decision

Option C.

- **Key wrapping:** for each registered authenticator, the root key gets its own wrapped copy under `HKDF-SHA-256(password key ‖ PRF output)`. The password key is the existing PBKDF2 output. The wrapped copies sit beside the password-only one, which is removed once a second factor is turned on.
- **More than one authenticator:** each one gets its own wrapped copy, so a lost key can be removed without losing the profile.
- **Recovery:** turning on the second factor also creates a recovery code, shown once, with its own wrapped copy under the password plus that code. Without it, losing every authenticator loses the profile, as forgetting the password does today.
- **Settings:** the options live under Settings → Security as "Two-factor unlock", with entries to add an authenticator, remove one, and replace the recovery code.
- **Backups:** an exported backup keeps using its own backup password (0010, Backups). The second factor protects the profile on this device, not the file.

## Trade-offs against the charter

- **Security:** both the password and the authenticator are needed, and nothing that could pass the check is stored in plain form.
- **Recoverability:** depends on the user keeping a second authenticator or the recovery code; the app says so before turning it on.
- **Usability:** each unlock needs a tap or a fingerprint as well as the password.
- **Complexity:** a new kind of wrapped key and a WebAuthn flow, all in `src/storage/keys.ts`, `src/storage/profiles.ts` and the profile commands.

## Open questions to settle before building

- **Extension origin:** whether WebAuthn works from the extension's `chrome-extension://` origin, and which relying-party ID it accepts there.
- **Popup closing:** the system's passkey dialog takes focus, and the toolbar popup closes when it loses focus, as with file windows. Unlocking may have to finish in a tab or a separate window; which one needs trying.
- **PRF support:** which authenticators the user has return a PRF secret (security keys with `hmac-secret`, platform passkeys), and on which Chrome versions.

## Rollback

Turning the second factor off re-wraps the root key under the password alone and deletes the authenticator wraps and the recovery wrap.

## How to verify

- With the second factor on, the password alone cannot unlock the profile, and neither can the authenticator alone.
- The recovery code with the password unlocks it.
- Removing an authenticator stops it working without affecting the others.

## Revisit if

WebAuthn is not usable from the extension at all, or the PRF extension is not available on the authenticators users have.
