# Governance

Little Later has one maintainer, [@AndysTMC](https://github.com/AndysTMC), who reviews and merges pull requests, cuts releases and has the final say.

## How decisions are made

- Day-to-day changes are decided in their issue or pull request.
- Choices that shape the project (architecture, stored formats, security model, workflow) are written up as decision records in [docs/decisions/](./docs/decisions/). A record starts as `proposed` and only the maintainer can accept it. Anyone can propose one in a pull request.
- A change that goes against an accepted record needs a new record that supersedes it.

## Becoming a maintainer

Someone who has made sustained, good-quality contributions can be invited to join as a maintainer. When that happens, this file lists them, and the project adds `CODEOWNERS` and reconsiders whether pull requests need a second maintainer's approval.

## If the maintainer is unavailable

Security reports go through GitHub private vulnerability reporting, which notifies the maintainer directly ([SECURITY.md](./SECURITY.md)). The code is MIT-licensed, so anyone may fork it if the project stops being maintained.
