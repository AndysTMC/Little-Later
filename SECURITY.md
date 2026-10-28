# Security policy

Little Later keeps your saves, notes and tasks on your own device, so we take anything that could expose or corrupt them seriously.

## Supported versions

Only the latest release gets security fixes.

## Reporting a vulnerability

Please do not open a public issue. Report it privately through [GitHub's vulnerability reporting](https://github.com/AndysTMC/Little-Later/security/advisories/new) instead.

Include what you found, how to reproduce it, and what an attacker could gain. You will get an acknowledgement within 7 days and a fix or a plan within 30. We will credit you in the advisory unless you ask us not to.

## Scope

In scope: the extension itself, its release workflow and its signed artifacts. Out of scope: AI servers or third-party sites the extension talks to, and attacks that need someone who already controls your unlocked browser profile.

## Verifying a release

Each release's zip and CRX carry a build provenance attestation. With the GitHub CLI:

```sh
gh attestation verify Little-Later-<version>.zip --repo AndysTMC/Little-Later
```

To verify offline, pass the release's `Little-Later-<version>.sigstore.json` as `--bundle`. Each release also lists its bundled packages in `Little-Later-<version>.cdx.json` (CycloneDX).
