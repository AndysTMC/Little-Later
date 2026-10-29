import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	ScheduleError,
	nextEscalationFire,
	nextOccurrence,
	parseRule,
	toInstant,
	type RecurrenceRule,
} from "little-shared/utils/schedule";

const ZONES = [
	"UTC",
	"America/New_York",
	"Europe/Berlin",
	"Asia/Kolkata",
	"Australia/Lord_Howe",
	"Pacific/Chatham",
];
const DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");

const ruleArb: fc.Arbitrary<RecurrenceRule> = fc
	.record({
		freq: fc.constantFrom("daily", "weekly", "monthly", "yearly"),
		interval: fc.oneof(
			fc.integer({ min: 1, max: 4 }),
			fc.integer({ min: 1, max: 60 }),
		),
		time: fc
			.tuple(
				fc.integer({ min: 0, max: 23 }),
				fc.integer({ min: 0, max: 59 }),
			)
			.map(([h, m]) => `${pad(h)}:${pad(m)}`),
		anchor: fc
			.date({
				min: new Date("1990-01-01T00:00:00Z"),
				max: new Date("2060-12-31T00:00:00Z"),
				noInvalidDate: true,
			})
			.map((d) => d.toISOString().slice(0, 10)),
		zone: fc.constantFrom("floating", ...ZONES),
		byWeekday: fc.option(
			fc.uniqueArray(fc.integer({ min: 1, max: 7 }), {
				minLength: 1,
				maxLength: 7,
			}),
			{ nil: undefined },
		),
		byMonthDay: fc.option(
			fc.oneof(fc.constant(-1), fc.integer({ min: 1, max: 31 })),
			{ nil: undefined },
		),
		byMonth: fc.option(fc.integer({ min: 1, max: 12 }), { nil: undefined }),
	})
	.map((raw) => {
		const daily = raw.freq === "daily" || raw.freq === "weekly";
		return {
			...raw,
			byWeekday: daily ? raw.byWeekday : undefined,
			byMonthDay: daily ? undefined : raw.byMonthDay,
			byMonth: raw.freq === "yearly" ? raw.byMonth : undefined,
		};
	})
	// parseRule rejects a few combinations, such as a daily rule that can
	// never land on its weekdays; those are covered by the parseRule property.
	.filter((raw) => {
		try {
			parseRule(raw);
			return true;
		} catch {
			return false;
		}
	})
	.map((raw) => parseRule(raw));

// The occurrence dates straight from the rule's definition, walked one day,
// month or year at a time from the anchor with no search shortcuts. Stops at
// the first date whose instant is after `after`.
const referenceNext = (
	rule: RecurrenceRule,
	after: number,
	zone: string,
): number => {
	const anchor = Temporal.PlainDate.from(rule.anchor);
	const onDay = (yearMonth: Temporal.PlainYearMonth, day: number) =>
		yearMonth.toPlainDate({
			day:
				day === -1
					? yearMonth.daysInMonth
					: Math.min(day, yearMonth.daysInMonth),
		});
	const candidates = function* (): Generator<Temporal.PlainDate> {
		if (rule.freq === "daily" || rule.freq === "weekly") {
			const anchorWeek = anchor.subtract({ days: anchor.dayOfWeek - 1 });
			const weekdays = rule.byWeekday ?? [anchor.dayOfWeek];
			for (let day = anchor; ; day = day.add({ days: 1 })) {
				if (rule.freq === "daily") {
					const days = anchor.until(day).days;
					if (
						days % rule.interval === 0 &&
						(!rule.byWeekday ||
							rule.byWeekday.includes(day.dayOfWeek))
					) {
						yield day;
					}
				} else {
					const weeks = Math.floor(anchorWeek.until(day).days / 7);
					if (
						weeks % rule.interval === 0 &&
						weekdays.includes(day.dayOfWeek)
					) {
						yield day;
					}
				}
			}
		}
		const day = rule.byMonthDay ?? anchor.day;
		for (let step = 0; ; step += rule.interval) {
			const yearMonth =
				rule.freq === "monthly"
					? anchor.toPlainYearMonth().add({ months: step })
					: Temporal.PlainYearMonth.from({
							year: anchor.year + step,
							month: rule.byMonth ?? anchor.month,
						});
			const date = onDay(yearMonth, day);
			if (Temporal.PlainDate.compare(date, anchor) >= 0) {
				yield date;
			}
		}
	};
	for (const date of candidates()) {
		const instant = toInstant(date, rule.time, zone);
		if (instant > after) {
			return instant;
		}
	}
	throw new Error("unreachable");
};

describe("schedule properties", () => {
	it("finds the same next occurrence as walking the rule from its anchor", () => {
		fc.assert(
			fc.property(
				ruleArb,
				fc.constantFrom(...ZONES),
				// Up to about 4 years past the anchor, sometimes before it.
				fc.integer({ min: -30 * DAY, max: 1500 * DAY }),
				(rule, deviceZone, offset) => {
					const zone =
						rule.zone === "floating" ? deviceZone : rule.zone;
					const after =
						Temporal.PlainDate.from(rule.anchor).toZonedDateTime(
							zone,
						).epochMilliseconds + offset;
					expect(nextOccurrence(rule, after, deviceZone)).toBe(
						referenceNext(rule, after, zone),
					);
				},
			),
			{ numRuns: 150 },
		);
		// The polyfilled Temporal of the test runtime is slow.
	}, 60_000);

	it("parses any input to a rule that parses to itself, or ScheduleError", () => {
		fc.assert(
			fc.property(
				fc.oneof(
					fc.anything(),
					ruleArb.map((rule) => ({ ...rule })),
					ruleArb.chain((rule) =>
						fc
							.record({
								key: fc.constantFrom(...Object.keys(rule)),
								value: fc.anything(),
							})
							.map(({ key, value }) => ({
								...rule,
								[key]: value,
							})),
					),
				),
				(input) => {
					let rule: RecurrenceRule;
					try {
						rule = parseRule(input);
					} catch (error) {
						expect(error).toBeInstanceOf(ScheduleError);
						return;
					}
					expect(parseRule(rule)).toEqual(rule);
				},
			),
		);
	});

	it("escalates toward the target and reaches it", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 2 ** 41 }),
				fc.integer({ min: 1, max: 365 * DAY }),
				fc.integer({ min: 0, max: 24 * 60 }),
				(lastFire, gap, stopBefore) => {
					const target = lastFire + gap;
					const escalation = { escalate: true as const, stopBefore };
					let fire = lastFire;
					for (let step = 0; fire < target; step++) {
						const next = nextEscalationFire(
							fire,
							target,
							escalation,
						);
						expect(next).toBeGreaterThan(fire);
						expect(next).toBeLessThanOrEqual(target);
						expect(step).toBeLessThan(64);
						fire = next;
					}
				},
			),
		);
	});
});
