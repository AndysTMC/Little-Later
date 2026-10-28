---
type: decision
---

# 0011. We will store instants as epoch milliseconds and recurrence as anchored rules, computed with Temporal

Status: proposed
Date: 2026-10-28
Deciders: AndysTMC
Supersedes: —
Superseded-by: —

## Context

Dates are stored as strings with a fixed UTC offset (`LDate`, `2026-10-28T09:00:00+05:30`, in `packages/shared/src/types.ts`), and recurrence keeps a time with an offset (`LTime`). An offset is not a time zone. A daily 09:00 reminder created in winter fires at 10:00 after a daylight-saving change, and travelling shifts everything. The review found wrong wall-clock reads and no month-end clamping, so a monthly task on the 31st misbehaves in short months (A6). String dates also sort and index poorly. Reminders can escalate (`LREMINDER_TYPE.ESCALATING` in `packages/shared/src/utils/reminder.ts`). Format v1 (decision 0010) is a free chance to fix all of this, since there are no users to migrate.

`Temporal` shipped enabled by default in Chrome 144 (January 2026). The manifest sets no `minimum_chrome_version`.

## Options

- A. **Keep offset strings** and patch reads and clamping. No model change, but the DST and travel bugs stay by design.
- B. **Epoch-ms instants plus our own rule engine on `Intl`.** No dependency, but about 200 lines of zone arithmetic to own.
- C. **The same model on the `rrule` library.** Mature, but about 30 KB, its own time-zone handling, and much more power than the product uses.
- D. **The same model on built-in `Temporal`, with `minimum_chrome_version` set to 144.** No dependency and no zone arithmetic of our own; drops Chrome versions older than about nine months.

## Decision

Option D.

**Stored values**

- Every instant (created, updated, due, next fire, last fired) is a number of milliseconds since the Unix epoch, in UTC. Indexes use these numbers.
- An all-day deadline is a floating civil date, `YYYY-MM-DD`, interpreted in whatever zone the device is in now. "Due on the 31st" is not an instant.
- A recurrence rule is `{ freq, interval, time: "HH:mm", byWeekday?, byMonthDay?, byMonth?, anchor, zone }`:
    - `freq` is `daily`, `weekly`, `monthly` or `yearly`.
    - `byMonthDay: -1` means the last day of the month.
    - `anchor` is the first occurrence as a civil date-time.
    - `zone` is either `"floating"` (the default: follow the device's zone) or an IANA zone name the user pinned.
- Escalation keeps today's behaviour (`packages/shared/src/utils/reminder.ts`): an escalating reminder fires at the midpoint between its last fire and its target, so the gaps halve as the target nears; it stops 15 minutes before the target and then fires once at the target, like a normal reminder. It is stored as `{ escalate: true, stopBefore: 15 }`.
- The rule, the escalation settings and the next-fire instant stay plain (0010), so the scheduler works while locked.

**Computing occurrences**

- The n-th occurrence is computed from the anchor and an occurrence index, never from the previous fire:
    - `daily` and `weekly` add `n * interval` days or weeks to the anchor's date, then apply `byWeekday`.
    - `monthly` and `yearly` first advance the anchor's `PlainYearMonth` by `n * interval` months or years, then apply the rule's day: `byMonthDay: -1` becomes that month's `daysInMonth`, and 1 to 31 is clamped with `overflow: "constrain"`. The anchor's own day is never carried over, so a "last day" or "31st" rule created on Feb 28 gives Mar 31, not Mar 28.
    - A monthly rule on the 31st gives Jan 31, Feb 28, Mar 31, with no drift. A yearly rule on Feb 29 gives Feb 28 in non-leap years.
- **Policy: every occurrence fires.** RFC 5545 §3.3.10 drops recurrence instances that fall on an invalid date or a nonexistent local time, so a calendar would skip February for a "31st" rule and skip the day a DST jump removes 02:30. Little Later deliberately does not: a reminder that silently skips a month is worse than one that fires a day early. Hence the clamping above, and:
- Converting a civil time to an instant uses `disambiguation: "compatible"`, which matches how RFC 5545 §3.3.5 reads a single DATE-TIME in a gap (with the offset from before the gap):
    - A time skipped by a DST jump moves forward by the length of the gap, so 02:30 becomes 03:30.
    - A time that occurs twice resolves to its first occurrence.
- A floating rule recomputes its next fire at every alarm, at browser start, when `chrome.idle` reports the device active again, and when a page opens. A laptop that wakes after flying east therefore fires 09:00 at 09:00 local, not hours late.
- **Catch-up.** Fires missed while the browser was closed collapse into one notification at start ("3 reminders while you were away"). Each rule then schedules its next future occurrence.
- **iCal export** translates the policy so other calendars produce the same dates:
    - `byMonthDay: -1` and a clamped 31st export as `BYMONTHDAY=-1`.
    - A clamped 29th or 30th exports as `BYMONTHDAY=28,…,d;BYSETPOS=-1`, which picks day d or the month's last day if shorter. A yearly Feb 29 exports as `BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1`.
    - A DST-gap occurrence has no RRULE form; export adds an `RDATE` for each shifted occurrence in the next five years, and the export notes say so.
    - Everything else maps one to one onto `RRULE` with `DTSTART;TZID=` or a floating `DTSTART`.

## Trade-offs against the charter

- **Correctness:** DST, travel, month-end and leap-day bugs are fixed by construction, with tests that pin the clock.
- **Maintainability:**
    - No zone arithmetic of our own and no dependency.
    - The rule code is small and pure.
    - It needs a test runtime that has `Temporal` (see A2).
- **Reach:** Chrome 143 and older can no longer install the extension. There are no users, and Chrome's own updates move nearly everyone past 144 within weeks.
- **Performance:** numeric indexes turn "due today" and "next reminder" into range queries.
- **Privacy:** the plain rule shows when a reminder repeats, but not what it says; this leak is listed in 0010.

## Rollback

- **Before release:** revert the PR.
- **After release:** a change is a forward migration (format v2), as for 0010.
- **Temporal problems:** if `Temporal` caused trouble in some Chrome, Option B's `Intl` engine could replace the computing functions behind the same stored model.

## How to verify

- Table tests for the next-occurrence function in three zones: America/New_York, Europe/Berlin, and Asia/Kolkata, which has no DST. They cover:
    - spring-forward and fall-back;
    - the 31st and last-day rules, including ones created in February;
    - Feb 29;
    - biweekly rules across a DST change;
    - a floating rule after the device's zone changes, without a browser restart;
    - escalation midpoints, the 15-minute stop and the final fire at the target;
    - catch-up after a closed browser;
    - iCal export of clamped and DST-gap rules, checked by expanding the exported RRULE and RDATEs and comparing against our occurrences.
- A property test: every next occurrence is strictly after the reference instant, and its local time equals the rule's time, except in a skipped hour.
- Format-v1 task and reminder fixtures that round-trip through backup.

## Assumptions

- [A1] `Temporal` is available in Chrome 144 and later, in both the service worker and pages. Revisit if a supported Chrome lacks it.
- [A2] The toolchain lacks `Temporal` today: the Bun 1.3.11 pinned in CI, the Node 22 that runs Vitest, and TypeScript 5.9's built-in types. Bun 1.4 has it at runtime. Implementation either moves CI to a Bun and TypeScript with `Temporal`, or adds `@js-temporal/polyfill` as a dev dependency loaded in `tests/setup.ts`, with its types. Either path is a dependency change that comes to AndysTMC first.
- [A3] Daily, weekly, monthly and yearly rules with one time each, plus escalation, cover what the UI offers. Revisit if users need "every second Tuesday" or several times a day.

## Consequences

- `manifest.json` gains `"minimum_chrome_version": "144"`.
- `LDate`, `LTime` and the offset helpers are replaced: `packages/shared/src/utils/datetime.ts` and the date parts of `task.ts` and `reminder.ts`.
- UI date pickers write instants or civil dates, never offset strings.
- `@formkit/tempo` leaves `packages/shared/package.json` once nothing uses it.
- The scheduler keeps one Chrome alarm for the earliest next fire, and re-arms it after each fire.

## Review

A third review (AndysTMC, 2026-10-28) pointed out that RFC 5545 drops invalid and nonexistent recurrence instances, so the draft's "RFC 5545 behaviour" claim was wrong for recurrences. Adopted: the fire-every-occurrence policy is now stated as our own choice, and iCal export translates it with `BYSETPOS` and `RDATE`.

An independent agent critiqued the first draft. Adopted:

- An anchor and an occurrence index, which fix month-end drift and make `interval` work.
- RFC 5545 handling of skipped times.
- Floating zones by default, recomputed at each alarm.
- Floating all-day dates.
- A catch-up policy for missed fires.
- Feb 29 clamping.
- A place for escalation in the model.
- A plain rule, so reminders keep firing while locked.
- Moving to `Temporal` after checking that it shipped in Chrome 144.

A second review (AndysTMC, 2026-10-28) found more. Adopted:

- Monthly and yearly occurrences advance a year-month and then apply the rule's day, which fixes "last day" rules created in a short month.
- Floating rules also recompute when the device wakes or a page opens.
- Escalation is written down as it works today, instead of a new invented behaviour.
- A corrected [A2]: the pinned Bun and TypeScript lack `Temporal`, so tests need a toolchain bump or a polyfill.

The first critique also suggested caching `Intl` formatters. That no longer applies, because `Temporal` replaces them.

## Revisit if

Recurrence needs grow beyond the four frequencies, or a supported browser lacks `Temporal`.
