# Changelog

All notable changes to Little Later are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A change to a stored format or the removal of a feature counts as breaking.

## [Unreleased]

### Changed

- **Breaking:** data is stored in a new encrypted format; data from 2.x is removed on update.
- Every record is encrypted on disk, and only the background worker writes data.
- Backups use `.lldat` format 3 and always need a password; profiles without a password can now export too.
- A task's reminder moves with the task's deadline, and recurring times follow the device to another time zone.
- Requires Chrome 144 or later.
- Releases also attach their signed build provenance as `Little-Later-<version>.intoto.jsonl`.

### Fixed

- The intro page no longer redirects in a loop, and the misc settings page no longer freezes.

## [2.1.1] - 2026-10-28

### Security

- Only the extension's own requests to local AI servers get the trusted `Origin` header; websites no longer do.
- The AI chat, notes and save cards no longer load remote images, links show their host, and notes reach the model as quoted data instead of instructions.
- Locking with a new password asks for it twice, removing a password needs an explicit choice, and deleting a locked profile needs its password.
- An imported backup no longer brings its AI endpoint and key with it, and a custom AI URL must use `https` unless it is on this machine.
- Preview and avatar images can only render as images.

### Changed

- Signed CRX releases, with zip and checksums, are built from version tags.
- CI checks formatting, lint, types, unit tests, the build and the end-to-end suite.
- Release workflow: least-privilege tokens, actions pinned to commit SHAs, tags must be on `main`, and build provenance is attested.
- A release refuses a tag that does not match the version in the manifest and package files, or that has no changelog section, and builds without a dependency cache.

### Added

- Contributing guide, security policy, issue and pull request templates, Dependabot, and this changelog.
- Every build includes `THIRD_PARTY_NOTICES.txt` with the license of each bundled package and the Rubik font, plus a CycloneDX SBOM.
- Releases ship the SBOM and a signed build provenance bundle that can be verified offline; release notes come from this changelog.
- CodeQL, OpenSSF Scorecard, workflow auditing and dependency review run in CI; support and governance docs.

## [2.1.0] - 2026-08-19

### Added

- AI changes to your data need confirmation in the chat.
- Backups use the profile's real lock password.

### Changed

- Visual consistency pass across the popup.

## [2.0.0] - 2026-04-05

### Changed

- Cleanup release.

## [1.0.0] - 2025-10-30

- First release.

[Unreleased]: https://github.com/AndysTMC/Little-Later/compare/v2.1.1...HEAD
[2.1.1]: https://github.com/AndysTMC/Little-Later/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/AndysTMC/Little-Later/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/AndysTMC/Little-Later/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/AndysTMC/Little-Later/releases/tag/v1.0.0
