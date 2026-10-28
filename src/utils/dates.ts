import type { RecurrenceRule } from "little-shared/utils/schedule";

// Showing instants (epoch milliseconds, decision 0011) in the device's
// current zone.

export const deviceZone = (): string =>
	Intl.DateTimeFormat().resolvedOptions().timeZone;

export const zoned = (ms: number): Temporal.ZonedDateTime =>
	Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(deviceZone());

const pad = (value: number) => String(value).padStart(2, "0");

// "h:mm AM", as the popup has always shown times.
export const prettyTime = (time: { hour: number; minute: number }): string =>
	`${hour12(time.hour)}:${pad(time.minute)} ${meridiem(time.hour)}`;

// "2026-10-28 9:05 PM"; today's date is left out.
export const prettyDate = (ms: number, now: number = Date.now()): string => {
	const date = zoned(ms);
	const day = date.toPlainDate().toString();
	return day === zoned(now).toPlainDate().toString()
		? prettyTime(date)
		: `${day} ${prettyTime(date)}`;
};

// How long ago a page was last visited, in the history list's buckets.
export const lastSeenInfo = (ms: number, now: number = Date.now()): string => {
	const date = zoned(ms).toPlainDate();
	const today = zoned(now).toPlainDate();
	const days = today.since(date).days;
	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	// Weeks start on Sunday.
	if (days >= 0 && days < (today.dayOfWeek % 7) + 1) {
		return `Current week on ${prettyDate(ms, now)}`;
	}
	if (date.year === today.year && date.month === today.month) {
		return "Current Month";
	}
	if (date.year === today.year) return "Current Year";
	return "Older";
};

// 12-hour clock parts, as the date and time inputs edit them.
export const hour12 = (hour: number): number =>
	hour % 12 === 0 ? 12 : hour % 12;
export const meridiem = (hour: number): "AM" | "PM" =>
	hour < 12 ? "AM" : "PM";
// Sets the 12-hour clock hour, keeping AM or PM.
export const withHour12 = (hour: number, value: number): number =>
	(value % 12) + (hour < 12 ? 0 : 12);

// The start of the next hour, a default time people rarely need to fix up.
export const nextHour = (): number =>
	Temporal.Now.zonedDateTimeISO(deviceZone()).round({
		smallestUnit: "hour",
		roundingMode: "ceil",
	}).epochMilliseconds;

// ISO order: Monday is 1.
export const WEEKDAY_NAMES = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];
const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const ordinal = (day: number): string => {
	if (day === -1) return "the last day";
	const suffix =
		day % 100 >= 11 && day % 100 <= 13
			? "th"
			: ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th");
	return `the ${day}${suffix}`;
};

// "Weekly on Monday at 9:00 AM", "Every 2 months on the 1st at 8:30 PM",
// "Yearly on the last day of February at 9:00 AM".
export const prettyRule = (rule: RecurrenceRule): string => {
	const [hour, minute] = rule.time.split(":").map(Number);
	const unit = {
		daily: "day",
		weekly: "week",
		monthly: "month",
		yearly: "year",
	}[rule.freq];
	const every =
		rule.interval === 1
			? rule.freq[0].toUpperCase() + rule.freq.slice(1)
			: `Every ${rule.interval} ${unit}s`;
	const on = (() => {
		switch (rule.freq) {
			case "daily":
			case "weekly":
				return rule.byWeekday
					? ` on ${rule.byWeekday.map((day) => WEEKDAY_NAMES[day - 1]).join(", ")}`
					: "";
			case "monthly":
				return rule.byMonthDay ? ` on ${ordinal(rule.byMonthDay)}` : "";
			case "yearly":
				return rule.byMonth && rule.byMonthDay
					? ` on ${ordinal(rule.byMonthDay)} of ${MONTH_NAMES[rule.byMonth - 1]}`
					: "";
		}
	})();
	return `${every}${on} at ${prettyTime({ hour, minute })}`;
};
