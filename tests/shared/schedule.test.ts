import { describe, expect, it } from "vitest";
import {
	ScheduleError,
	countOccurrences,
	nextEscalationFire,
	nextOccurrence,
	parseRule,
	type RecurrenceRule,
} from "little-shared/utils/schedule";

const NY = "America/New_York";
const BERLIN = "Europe/Berlin";
const KOLKATA = "Asia/Kolkata";

const at = (zoned: string) =>
	Temporal.ZonedDateTime.from(zoned).epochMilliseconds;
const local = (instant: number, zone: string) =>
	Temporal.Instant.fromEpochMilliseconds(instant)
		.toZonedDateTimeISO(zone)
		.toPlainDateTime()
		.toString({ smallestUnit: "minute" });

const rule = (overrides: Partial<RecurrenceRule>): RecurrenceRule =>
	parseRule({
		freq: "daily",
		interval: 1,
		time: "09:00",
		anchor: "2026-01-01",
		zone: "floating",
		...overrides,
	});

// The next `count` occurrences after `from`, as local wall-clock times.
const series = (
	r: RecurrenceRule,
	from: number,
	zone: string,
	count: number,
	shownIn = zone,
) => {
	const out: Array<string> = [];
	let cursor = from;
	for (let i = 0; i < count; i++) {
		cursor = nextOccurrence(r, cursor, zone);
		out.push(local(cursor, shownIn));
	}
	return out;
};

describe("daily rules across DST", () => {
	it.each([NY, BERLIN, KOLKATA])("keeps 09:00 local in %s", (zone) => {
		const r = rule({ anchor: "2026-03-01" });
		const times = series(r, at(`2026-03-01T00:00[${zone}]`), zone, 60);
		expect(times.every((t) => t.endsWith("T09:00"))).toBe(true);
	});

	it("moves a skipped 02:30 forward by the gap on spring-forward day", () => {
		const r = rule({ time: "02:30", anchor: "2026-03-07" });
		expect(series(r, at(`2026-03-07T00:00[${NY}]`), NY, 3)).toEqual([
			"2026-03-07T02:30",
			"2026-03-08T03:30",
			"2026-03-09T02:30",
		]);
	});

	it("fires a repeated 01:30 once, at its first occurrence, on fall-back day", () => {
		const r = rule({ time: "01:30", anchor: "2026-10-31" });
		const from = at(`2026-11-01T00:00[${NY}]`);
		const fire = nextOccurrence(r, from, NY);
		expect(fire).toBe(at(`2026-11-01T01:30-04:00[${NY}]`));
		expect(local(nextOccurrence(r, fire, NY), NY)).toBe("2026-11-02T01:30");
	});
});

describe("weekly rules", () => {
	it("keeps a biweekly Monday and Thursday rule at 08:15 across DST", () => {
		const r = rule({
			freq: "weekly",
			interval: 2,
			time: "08:15",
			byWeekday: [4, 1],
			anchor: "2026-03-02",
		});
		expect(series(r, at(`2026-03-01T00:00[${BERLIN}]`), BERLIN, 6)).toEqual(
			[
				"2026-03-02T08:15",
				"2026-03-05T08:15",
				"2026-03-16T08:15",
				"2026-03-19T08:15",
				"2026-03-30T08:15",
				"2026-04-02T08:15",
			],
		);
	});

	it("drops weekdays before the anchor in its first week", () => {
		const r = rule({
			freq: "weekly",
			byWeekday: [1, 5],
			anchor: "2026-01-07",
		});
		expect(series(r, at(`2026-01-01T00:00[${NY}]`), NY, 2)).toEqual([
			"2026-01-09T09:00",
			"2026-01-12T09:00",
		]);
	});
});

describe("monthly and yearly rules", () => {
	it("keeps the 31st without drifting through short months", () => {
		const r = rule({
			freq: "monthly",
			byMonthDay: 31,
			anchor: "2026-01-31",
		});
		expect(
			series(r, at(`2026-01-01T00:00[${KOLKATA}]`), KOLKATA, 5),
		).toEqual([
			"2026-01-31T09:00",
			"2026-02-28T09:00",
			"2026-03-31T09:00",
			"2026-04-30T09:00",
			"2026-05-31T09:00",
		]);
	});

	it("gives a last-day rule created in February the 31st in March", () => {
		const r = rule({
			freq: "monthly",
			byMonthDay: -1,
			anchor: "2026-02-28",
		});
		expect(series(r, at(`2026-02-01T00:00[${NY}]`), NY, 3)).toEqual([
			"2026-02-28T09:00",
			"2026-03-31T09:00",
			"2026-04-30T09:00",
		]);
	});

	it("gives a 31st rule created on Feb 28 the 31st in March", () => {
		const r = rule({
			freq: "monthly",
			byMonthDay: 31,
			anchor: "2026-02-28",
		});
		expect(series(r, at(`2026-02-01T00:00[${NY}]`), NY, 2)).toEqual([
			"2026-02-28T09:00",
			"2026-03-31T09:00",
		]);
	});

	it("honours an interval of months", () => {
		const r = rule({ freq: "monthly", interval: 3, anchor: "2026-01-15" });
		expect(series(r, at(`2026-01-01T00:00[${NY}]`), NY, 3)).toEqual([
			"2026-01-15T09:00",
			"2026-04-15T09:00",
			"2026-07-15T09:00",
		]);
	});

	// The search used to start at elapsed days / 28 months, which runs
	// ahead of the calendar by about a month every year, so a rule a few
	// years old skipped straight past its next occurrence.
	it("finds the next occurrence of a monthly rule years after its anchor", () => {
		const r = rule({
			freq: "monthly",
			byMonthDay: 31,
			anchor: "2020-01-31",
		});
		expect(series(r, at(`2026-10-15T00:00[${NY}]`), NY, 3)).toEqual([
			"2026-10-31T09:00",
			"2026-11-30T09:00",
			"2026-12-31T09:00",
		]);
		expect(
			countOccurrences(
				r,
				at(`2026-10-15T00:00[${NY}]`),
				at(`2026-12-31T12:00[${NY}]`),
				NY,
			),
		).toBe(3);
	});

	// Years of 365 days drift the same way, only far more slowly.
	it("finds the next occurrence of a yearly rule millennia after its anchor", () => {
		const r = rule({ freq: "yearly", anchor: "2024-03-01" });
		expect(series(r, at(`9026-02-01T00:00[${NY}]`), NY, 1)).toEqual([
			"9026-03-01T09:00",
		]);
	});

	it("moves Feb 29 to Feb 28 in non-leap years", () => {
		const r = rule({ freq: "yearly", anchor: "2028-02-29" });
		expect(series(r, at(`2028-01-01T00:00[${NY}]`), NY, 3)).toEqual([
			"2028-02-29T09:00",
			"2029-02-28T09:00",
			"2030-02-28T09:00",
		]);
	});
});

describe("zones", () => {
	it("follows the device's zone for a floating rule, with no restart", () => {
		const r = rule({ anchor: "2026-06-01" });
		const now = at(`2026-06-10T12:00[${NY}]`);
		// The device flew east: the next 09:00 is Berlin's.
		expect(local(nextOccurrence(r, now, BERLIN), BERLIN)).toBe(
			"2026-06-11T09:00",
		);
		expect(local(nextOccurrence(r, now, NY), NY)).toBe("2026-06-11T09:00");
	});

	it("keeps a pinned zone wherever the device is", () => {
		const r = rule({ anchor: "2026-06-01", zone: KOLKATA });
		const fire = nextOccurrence(r, at(`2026-06-10T00:00[${KOLKATA}]`), NY);
		expect(local(fire, KOLKATA)).toBe("2026-06-10T09:00");
	});

	it("finds the next occurrence far from the anchor", () => {
		const r = rule({ anchor: "2020-01-01" });
		expect(
			local(nextOccurrence(r, at(`2030-05-05T10:00[${NY}]`), NY), NY),
		).toBe("2030-05-06T09:00");
	});
});

describe("properties", () => {
	it("is strictly after the reference and at the rule's local time", () => {
		const rules = [
			rule({ anchor: "2026-01-03", time: "07:45" }),
			rule({
				freq: "weekly",
				interval: 3,
				byWeekday: [2, 6],
				time: "18:05",
			}),
			rule({ freq: "monthly", byMonthDay: -1, time: "23:59" }),
			rule({ freq: "yearly", byMonth: 3, byMonthDay: 8, time: "02:30" }),
		];
		let seed = 42;
		const random = () => {
			seed = (seed * 1103515245 + 12345) % 2 ** 31;
			return seed / 2 ** 31;
		};
		const start = at(`2026-01-01T00:00[${NY}]`);
		for (const r of rules) {
			for (let i = 0; i < 200; i++) {
				const after =
					start + Math.floor(random() * 4 * 365 * 86_400_000);
				const fire = nextOccurrence(r, after, NY);
				expect(fire).toBeGreaterThan(after);
				const time = local(fire, NY).slice(11);
				// Only a time inside a skipped hour may differ.
				if (time !== r.time) {
					expect(r.time).toBe("02:30");
					expect(time).toBe("03:30");
				}
			}
		}
	});
});

describe("catch-up", () => {
	it("counts occurrences missed while the browser was closed", () => {
		const r = rule({ anchor: "2026-01-01" });
		expect(
			countOccurrences(
				r,
				at(`2026-01-05T12:00[${NY}]`),
				at(`2026-01-09T12:00[${NY}]`),
				NY,
			),
		).toBe(4);
	});
});

describe("escalation", () => {
	const target = at(`2026-01-01T12:00[${NY}]`);
	const settings = { escalate: true as const, stopBefore: 15 };

	it("halves the gap until 15 minutes before the target, then fires at it", () => {
		let last = at(`2026-01-01T08:00[${NY}]`);
		const fires: Array<string> = [];
		while (last < target) {
			last = nextEscalationFire(last, target, settings);
			fires.push(local(last, NY).slice(11));
		}
		expect(fires).toEqual(["10:00", "11:00", "11:30", "12:00"]);
	});

	// A backup may set stopBefore to 0, so the gap halves down to 1 ms.
	it("always moves forward and reaches the target with stopBefore 0", () => {
		const noStop = { escalate: true as const, stopBefore: 0 };
		let last = target - 5;
		const fires: Array<number> = [];
		while (last < target) {
			last = nextEscalationFire(last, target, noStop);
			fires.push(target - last);
		}
		expect(fires).toEqual([3, 2, 1, 0]);
	});
});

describe("parseRule", () => {
	it.each([
		[{ freq: "hourly" }, /freq/],
		[{ interval: 0 }, /interval/],
		[{ interval: 1.5 }, /interval/],
		[{ time: "9:00" }, /time/],
		[{ time: "24:00" }, /time/],
		[{ anchor: "2026-02-30" }, /anchor/],
		[{ zone: "Mars/Olympus" }, /zone/],
		[{ freq: "monthly", byWeekday: [1] }, /byWeekday/],
		[{ byWeekday: [] }, /byWeekday/],
		[{ byWeekday: [8] }, /byWeekday/],
		[{ freq: "monthly", byMonthDay: 0 }, /byMonthDay/],
		[{ byMonthDay: 3 }, /byMonthDay/],
		[{ freq: "monthly", byMonth: 2 }, /byMonth/],
		// 2026-01-01 is a Thursday; every 7 or 14 days stays on Thursday.
		[{ interval: 7, byWeekday: [5] }, /never/],
		[{ interval: 14, byWeekday: [1, 3] }, /never/],
	])("refuses %j", (overrides, message) => {
		expect(() =>
			parseRule({
				freq: "daily",
				interval: 1,
				time: "09:00",
				anchor: "2026-01-01",
				zone: "floating",
				...overrides,
			}),
		).toThrow(ScheduleError);
		expect(() =>
			parseRule({
				freq: "daily",
				interval: 1,
				time: "09:00",
				anchor: "2026-01-01",
				zone: "floating",
				...overrides,
			}),
		).toThrow(message);
	});

	it("keeps only known fields and sorts weekdays", () => {
		expect(
			parseRule({
				freq: "weekly",
				interval: 1,
				time: "09:00",
				anchor: "2026-01-01",
				zone: NY,
				byWeekday: [5, 1, 5],
				extra: "dropped",
			}),
		).toEqual({
			freq: "weekly",
			interval: 1,
			time: "09:00",
			anchor: "2026-01-01",
			zone: NY,
			byWeekday: [1, 5],
		});
	});
});
