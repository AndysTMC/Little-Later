---
type: log
---

# History

Events that git commits will not explain.

## 2026-08-19

- The extension signing private key that previously appeared in git history is burned. Do not reuse it. New releases are signed with a key that exists only as the GitHub Actions secret `SIGNING_KEY`. The public extension ID changes with that rotation.

## 2026-10-29

- The release signing key was rotated again. `SIGNING_KEY` now lives only in the `release` environment (decision 0013), and the repository-level secret is gone. Releases from 3.0.0 on have a different extension ID from 2.x releases.
