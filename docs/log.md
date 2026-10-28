---
type: log
---

# History

Events that git commits will not explain.

## 2026-08-19

- The extension signing private key that previously appeared in git history is burned. Do not reuse it. New releases are signed with a key that exists only as the GitHub Actions secret `SIGNING_KEY`. The public extension ID changes with that rotation.
