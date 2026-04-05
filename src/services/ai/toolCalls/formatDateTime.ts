import { LDate } from "little-shared/types";

const toolCall = ({
	day,
	hour,
	minute,
	month,
	second,
	year,
}: {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second?: number;
}): LDate => {
	const safeSecond = second ?? 0;
	if (
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		!Number.isInteger(day) ||
		!Number.isInteger(hour) ||
		!Number.isInteger(minute) ||
		!Number.isInteger(safeSecond)
	) {
		throw new Error("Date-time values must be integers.");
	}
	if (month < 1 || month > 12) {
		throw new Error("month must be between 1 and 12.");
	}
	if (day < 1 || day > 31) {
		throw new Error("day must be between 1 and 31.");
	}
	if (hour < 0 || hour > 23) {
		throw new Error("hour must be between 0 and 23.");
	}
	if (minute < 0 || minute > 59) {
		throw new Error("minute must be between 0 and 59.");
	}
	if (safeSecond < 0 || safeSecond > 59) {
		throw new Error("second must be between 0 and 59.");
	}

	const date = new Date(year, month - 1, day, hour, minute, safeSecond, 0);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day ||
		date.getHours() !== hour ||
		date.getMinutes() !== minute ||
		date.getSeconds() !== safeSecond
	) {
		throw new Error("Invalid calendar date-time.");
	}
	const pad2 = (value: number): string => value.toString().padStart(2, "0");
	const timezoneOffsetMinutes = -date.getTimezoneOffset();
	const offsetSign = timezoneOffsetMinutes >= 0 ? "+" : "-";
	const offsetHours = Math.floor(Math.abs(timezoneOffsetMinutes) / 60);
	const offsetMinutes = Math.abs(timezoneOffsetMinutes) % 60;
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
		date.getDate(),
	)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
		date.getSeconds(),
	)}${offsetSign}${pad2(offsetHours)}:${pad2(offsetMinutes)}` as LDate;
};

export { toolCall as formatDateTimeToolCall };
