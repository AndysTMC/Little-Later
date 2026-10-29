// The format v1 time model (decision 0011). Instants are epoch milliseconds.
// A recurring schedule is a rule anchored at its first occurrence; the n-th
// occurrence is computed from the anchor, never from the previous fire, so
// month ends and DST changes cannot make it drift. Uses the built-in
// Temporal of Chrome 144 and later.

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export type RecurrenceRule = {
	freq: Frequency;
	// Every `interval` days, weeks, months or years.
	interval: number;
	// Local wall-clock time of each occurrence, "HH:mm".
	time: string;
	// ISO weekdays, 1 = Monday … 7 = Sunday. Daily and weekly rules only.
	byWeekday?: Array<number>;
	// 1 to 31, or -1 for the month's last day. Monthly and yearly rules.
	byMonthDay?: number;
	// 1 to 12. Yearly rules.
	byMonth?: number;
	// The first occurrence as a civil date, "YYYY-MM-DD".
	anchor: string;
	// "floating" follows the device's current zone; otherwise an IANA zone
	// the user pinned.
	zone: string;
};

export class ScheduleError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ScheduleError";
	}
}

const FREQUENCIES: ReadonlyArray<Frequency> = [
	"daily",
	"weekly",
	"monthly",
	"yearly",
];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_INTERVAL = 1000;

const isIntIn = (value: unknown, min: number, max: number): value is number =>
	Number.isInteger(value) &&
	(value as number) >= min &&
	(value as number) <= max;

// Turns untrusted input (a command, an AI tool call, a backup) into a rule,
// or throws ScheduleError naming the first problem.
export const parseRule = (input: unknown): RecurrenceRule => {
	if (typeof input !== "object" || input === null) {
		throw new ScheduleError("A rule must be an object.");
	}
	const raw = input as Record<string, unknown>;
	const freq = raw.freq as Frequency;
	if (!FREQUENCIES.includes(freq)) {
		throw new ScheduleError(
			"freq must be daily, weekly, monthly or yearly.",
		);
	}
	if (!isIntIn(raw.interval, 1, MAX_INTERVAL)) {
		throw new ScheduleError(`interval must be 1 to ${MAX_INTERVAL}.`);
	}
	if (typeof raw.time !== "string" || !TIME_PATTERN.test(raw.time)) {
		throw new ScheduleError('time must be "HH:mm".');
	}
	if (typeof raw.anchor !== "string") {
		throw new ScheduleError('anchor must be a "YYYY-MM-DD" date.');
	}
	try {
		Temporal.PlainDate.from(raw.anchor, { overflow: "reject" });
	} catch {
		throw new ScheduleError('anchor must be a "YYYY-MM-DD" date.');
	}
	if (typeof raw.zone !== "string") {
		throw new ScheduleError('zone must be "floating" or a time zone.');
	}
	if (raw.zone !== "floating") {
		try {
			Temporal.Now.instant().toZonedDateTimeISO(raw.zone);
		} catch {
			throw new ScheduleError(`Unknown time zone ${raw.zone}.`);
		}
	}
	const rule: RecurrenceRule = {
		freq,
		interval: raw.interval,
		time: raw.time,
		anchor: raw.anchor,
		zone: raw.zone,
	};
	if (raw.byWeekday !== undefined) {
		if (freq !== "daily" && freq !== "weekly") {
			throw new ScheduleError("byWeekday is for daily and weekly rules.");
		}
		if (
			!Array.isArray(raw.byWeekday) ||
			raw.byWeekday.length === 0 ||
			!raw.byWeekday.every((day) => isIntIn(day, 1, 7))
		) {
			throw new ScheduleError("byWeekday must list weekdays 1 to 7.");
		}
		rule.byWeekday = [...new Set(raw.byWeekday as Array<number>)].sort();
	}
	if (raw.byMonthDay !== undefined) {
		if (freq !== "monthly" && freq !== "yearly") {
			throw new ScheduleError(
				"byMonthDay is for monthly and yearly rules.",
			);
		}
		if (raw.byMonthDay !== -1 && !isIntIn(raw.byMonthDay, 1, 31)) {
			throw new ScheduleError("byMonthDay must be 1 to 31, or -1.");
		}
		rule.byMonthDay = raw.byMonthDay as number;
	}
	if (raw.byMonth !== undefined) {
		if (freq !== "yearly") {
			throw new ScheduleError("byMonth is for yearly rules.");
		}
		if (!isIntIn(raw.byMonth, 1, 12)) {
			throw new ScheduleError("byMonth must be 1 to 12.");
		}
		rule.byMonth = raw.byMonth;
	}
	return rule;
};

// The rule's day within a month: -1 is the last day, and a day the month
// lacks clamps to its last day (the 31st in April is the 30th).
const dayIn = (yearMonth: Temporal.PlainYearMonth, day: number) =>
	yearMonth.toPlainDate({
		day:
			day === -1
				? yearMonth.daysInMonth
				: Math.min(day, yearMonth.daysInMonth),
	});

// The civil dates of one period of the rule, in order. Period 0 contains
// the anchor; dates before the anchor are dropped.
const datesOfPeriod = (
	rule: RecurrenceRule,
	anchor: Temporal.PlainDate,
	period: number,
): Array<Temporal.PlainDate> => {
	const step = period * rule.interval;
	let dates: Array<Temporal.PlainDate>;
	switch (rule.freq) {
		case "daily": {
			const date = anchor.add({ days: step });
			dates =
				rule.byWeekday && !rule.byWeekday.includes(date.dayOfWeek)
					? []
					: [date];
			break;
		}
		case "weekly": {
			const weekStart = anchor
				.subtract({ days: anchor.dayOfWeek - 1 })
				.add({ weeks: step });
			dates = (rule.byWeekday ?? [anchor.dayOfWeek]).map((day) =>
				weekStart.add({ days: day - 1 }),
			);
			break;
		}
		case "monthly": {
			const yearMonth = anchor.toPlainYearMonth().add({ months: step });
			dates = [dayIn(yearMonth, rule.byMonthDay ?? anchor.day)];
			break;
		}
		case "yearly": {
			const yearMonth = Temporal.PlainYearMonth.from({
				year: anchor.year + step,
				month: rule.byMonth ?? anchor.month,
			});
			dates = [dayIn(yearMonth, rule.byMonthDay ?? anchor.day)];
			break;
		}
	}
	return dates.filter(
		(date) => Temporal.PlainDate.compare(date, anchor) >= 0,
	);
};

const PERIOD_UNIT = {
	daily: "days",
	weekly: "weeks",
	monthly: "months",
	yearly: "years",
} as const;

// The periods between two dates, counted in calendar units, less a margin,
// so the search starts just before the answer instead of at the anchor.
// Counting months as 28 days ran ahead of the calendar and started the
// search past the next occurrence once a rule was a few years old.
const periodsBetween = (
	rule: RecurrenceRule,
	from: Temporal.PlainDate,
	to: Temporal.PlainDate,
): number => {
	const unit = PERIOD_UNIT[rule.freq];
	const elapsed = from.until(to, { largestUnit: unit })[unit];
	return Math.max(0, Math.floor(elapsed / rule.interval) - 2);
};

export const resolveZone = (rule: RecurrenceRule, deviceZone: string) =>
	rule.zone === "floating" ? deviceZone : rule.zone;

// A civil date and time as an instant. A time skipped by a DST jump moves
// forward by the gap; a repeated time resolves to its first occurrence
// ("compatible", as RFC 5545 does for DATE-TIME values).
export const toInstant = (
	date: Temporal.PlainDate,
	time: string,
	zone: string,
): number =>
	date
		.toPlainDateTime(Temporal.PlainTime.from(time))
		.toZonedDateTime(zone, { disambiguation: "compatible" })
		.epochMilliseconds;

// The first occurrence strictly after `after`. Every occurrence fires, even
// one whose time a DST jump skips (decision 0011).
export const nextOccurrence = (
	rule: RecurrenceRule,
	after: number,
	deviceZone: string,
): number => {
	const zone = resolveZone(rule, deviceZone);
	const anchor = Temporal.PlainDate.from(rule.anchor);
	const afterDate = Temporal.Instant.fromEpochMilliseconds(after)
		.toZonedDateTimeISO(zone)
		.toPlainDate();
	// Start a little before `after`'s date; a rule that matches nothing for
	// this many periods is not one parseRule accepts.
	const start = periodsBetween(rule, anchor, afterDate);
	for (let period = start; period < start + 1_000; period++) {
		for (const date of datesOfPeriod(rule, anchor, period)) {
			const instant = toInstant(date, rule.time, zone);
			if (instant > after) {
				return instant;
			}
		}
	}
	throw new ScheduleError("The rule has no upcoming occurrence.");
};

// How many occurrences fell in (from, to]: missed fires while the browser
// was closed, shown as one catch-up notification.
export const countOccurrences = (
	rule: RecurrenceRule,
	from: number,
	to: number,
	deviceZone: string,
	limit = 100,
): number => {
	let count = 0;
	let cursor = from;
	while (count < limit) {
		cursor = nextOccurrence(rule, cursor, deviceZone);
		if (cursor > to) {
			break;
		}
		count++;
	}
	return count;
};

export type Escalation = { escalate: true; stopBefore: number };

const MINUTE = 60_000;

// Escalating reminders, as before format v1: each fire lands halfway
// between the last fire and the target, so the gaps halve as the target
// nears; within `stopBefore` minutes of the target the next fire is the
// target itself.
export const nextEscalationFire = (
	lastFire: number,
	target: number,
	escalation: Escalation,
): number => {
	const midpoint = lastFire + Math.floor((target - lastFire) / 2);
	return midpoint < target - escalation.stopBefore * MINUTE
		? midpoint
		: target;
};
