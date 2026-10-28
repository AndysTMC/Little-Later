import { describe, expect, it } from "vitest";
import { prettyRule, withHour12 } from "../../src/utils/dates";

const rule = {
	interval: 1,
	time: "09:05",
	anchor: "2026-03-01",
	zone: "floating",
};

describe("prettyRule", () => {
	it.each([
		[{ ...rule, freq: "daily" }, "Daily at 9:05 AM"],
		[
			{ ...rule, freq: "weekly", byWeekday: [1, 5] },
			"Weekly on Monday, Friday at 9:05 AM",
		],
		[
			{
				...rule,
				freq: "monthly",
				interval: 2,
				byMonthDay: 22,
				time: "20:30",
			},
			"Every 2 months on the 22nd at 8:30 PM",
		],
		[
			{
				...rule,
				freq: "yearly",
				byMonth: 2,
				byMonthDay: -1,
				time: "00:00",
			},
			"Yearly on the last day of February at 12:00 AM",
		],
		[
			{ ...rule, freq: "monthly", byMonthDay: 13 },
			"Monthly on the 13th at 9:05 AM",
		],
	] as const)("%j reads %s", (input, expected) => {
		expect(
			prettyRule({
				...input,
				byWeekday:
					"byWeekday" in input ? [...input.byWeekday] : undefined,
			}),
		).toBe(expected);
	});
});

describe("withHour12", () => {
	it("keeps the half of the day", () => {
		expect(withHour12(9, 12)).toBe(0);
		expect(withHour12(9, 11)).toBe(11);
		expect(withHour12(15, 12)).toBe(12);
		expect(withHour12(15, 1)).toBe(13);
	});
});
