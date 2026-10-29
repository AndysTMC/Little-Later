// Temporal is built into Chrome 144 and later, which the extension requires
// (decision 0011). TypeScript 5.9 has no types for it yet, so these borrow
// the polyfill's types. Only tests load the polyfill itself
// (tests/setup.ts); nothing from it ships in the extension.
import type { Temporal as TemporalTypes } from "@js-temporal/polyfill";

declare global {
	const Temporal: typeof TemporalTypes;
	namespace Temporal {
		type Instant = TemporalTypes.Instant;
		type ZonedDateTime = TemporalTypes.ZonedDateTime;
		type PlainDate = TemporalTypes.PlainDate;
		type PlainTime = TemporalTypes.PlainTime;
		type PlainDateTime = TemporalTypes.PlainDateTime;
		type PlainYearMonth = TemporalTypes.PlainYearMonth;
		type Duration = TemporalTypes.Duration;
	}
}

export {};
