import { describe, expect, it } from "vitest";

// Guards the test runtime, not the product: every test sees a Temporal like
// Chrome's, so time-model tests run anywhere.
describe("Temporal in tests", () => {
	it("is available globally and handles zones and DST", () => {
		const start = Temporal.ZonedDateTime.from(
			"2026-03-08T01:30[America/New_York]",
		);
		const later: Temporal.ZonedDateTime = start.add({ hours: 1 });
		expect(later.toPlainTime().toString()).toBe("03:30:00");
		expect(
			Temporal.PlainDate.from("2026-02-28").with(
				{ day: 31 },
				{ overflow: "constrain" },
			).day,
		).toBe(28);
	});
});
