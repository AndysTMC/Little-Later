# Decisions

| ID   | Title                                                                                                   | Status   | Date       | Supersedes |
| ---- | ------------------------------------------------------------------------------------------------------- | -------- | ---------- | ---------- |
| 0001 | We will stay extension-only and local-first, with no backend                                            | accepted | 2026-08-19 | —          |
| 0002 | We will keep a single unlocked Dexie vault                                                              | accepted | 2026-08-19 | —          |
| 0003 | AI may read freely; mutate, destructive, and export tools require in-chat confirmation                  | accepted | 2026-08-19 | —          |
| 0004 | Importable `.lldat` uses the real lock password; passwordless profiles cannot export importable bundles | accepted | 2026-08-19 | —          |
| 0005 | Settings stay in `chrome.storage.local` with a fail-closed `activeUserId` stamp                         | accepted | 2026-08-19 | —          |
| 0006 | Extension signing keys live only outside git                                                            | accepted | 2026-08-19 | —          |
| 0007 | Close the P0 security gaps before the core rebuild                                                      | accepted | 2026-10-27 | —          |
| 0008 | Run the repository like an open-source project                                                          | proposed | 2026-10-27 | —          |
| 0009 | Measure supply-chain health and ship license notices with every build                                   | proposed | 2026-10-28 | —          |
| 0010 | We will encrypt each record under a wrapped profile key, in one versioned database                      | accepted | 2026-10-28 | —          |
| 0011 | We will store instants as epoch milliseconds and recurrence as anchored rules, computed with Temporal   | accepted | 2026-10-28 | —          |
| 0012 | We will make the service worker the only writer, through typed commands                                 | accepted | 2026-10-28 | —          |
