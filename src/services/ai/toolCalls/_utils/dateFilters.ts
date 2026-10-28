import { LDate, LTime } from "little-shared/types";
import { deviceZone } from "../../../../utils/dates";

export type LDateMatchCriteria = {
	year?: boolean;
	month?: boolean;
	day?: boolean;
	hour?: boolean;
	minute?: boolean;
	second?: boolean;
};

const DATE_REGEX =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})$/;
const TIME_REGEX = /^(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})$/;

const parseDateParts = (value: string) => {
	const match = DATE_REGEX.exec(value);
	if (!match) {
		return undefined;
	}

	const [
		,
		yearRaw,
		monthRaw,
		dayRaw,
		hourRaw,
		minuteRaw,
		secondRaw,
		,
		offsetHourRaw,
		offsetMinuteRaw,
	] = match;

	const year = Number.parseInt(yearRaw, 10);
	const month = Number.parseInt(monthRaw, 10);
	const day = Number.parseInt(dayRaw, 10);
	const hour = Number.parseInt(hourRaw, 10);
	const minute = Number.parseInt(minuteRaw, 10);
	const second = Number.parseInt(secondRaw, 10);
	const offsetHour = Number.parseInt(offsetHourRaw, 10);
	const offsetMinute = Number.parseInt(offsetMinuteRaw, 10);

	if (
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31 ||
		hour < 0 ||
		hour > 23 ||
		minute < 0 ||
		minute > 59 ||
		second < 0 ||
		second > 59 ||
		offsetHour < 0 ||
		offsetHour > 23 ||
		offsetMinute < 0 ||
		offsetMinute > 59
	) {
		return undefined;
	}

	return {
		year,
		month,
		day,
		hour,
		minute,
		second,
	};
};

const parseTimeParts = (value: string) => {
	const match = TIME_REGEX.exec(value);
	if (!match) {
		return undefined;
	}
	const [, hourRaw, minuteRaw, secondRaw, , offsetHourRaw, offsetMinuteRaw] =
		match;

	const hour = Number.parseInt(hourRaw, 10);
	const minute = Number.parseInt(minuteRaw, 10);
	const second = Number.parseInt(secondRaw, 10);
	const offsetHour = Number.parseInt(offsetHourRaw, 10);
	const offsetMinute = Number.parseInt(offsetMinuteRaw, 10);

	if (
		hour < 0 ||
		hour > 23 ||
		minute < 0 ||
		minute > 59 ||
		second < 0 ||
		second > 59 ||
		offsetHour < 0 ||
		offsetHour > 23 ||
		offsetMinute < 0 ||
		offsetMinute > 59
	) {
		return undefined;
	}

	return {
		hour,
		minute,
		second,
	};
};

export const isValidLDateString = (value: unknown): value is LDate =>
	typeof value === "string" && parseDateParts(value) !== undefined;

export const isValidLTimeString = (value: unknown): value is LTime =>
	typeof value === "string" && parseTimeParts(value) !== undefined;

export const normalizeDateMatchCriteria = (
	value: unknown,
): LDateMatchCriteria | undefined => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	const criteriaInput = value as Record<string, unknown>;
	const criteria: LDateMatchCriteria = {
		year: criteriaInput.year === true,
		month: criteriaInput.month === true,
		day: criteriaInput.day === true,
		hour: criteriaInput.hour === true,
		minute: criteriaInput.minute === true,
		second: criteriaInput.second === true,
	};
	const hasAny = Object.values(criteria).some(Boolean);
	return hasAny ? criteria : undefined;
};

// Instants (epoch milliseconds, 0011) as the model reads and writes them:
// "YYYY-MM-DDTHH:mm:ss+hh:mm" in the device's zone.
export const toModelDate = (ms: number): LDate =>
	Temporal.Instant.fromEpochMilliseconds(ms)
		.toZonedDateTimeISO(deviceZone())
		.toString({ smallestUnit: "second", timeZoneName: "never" }) as LDate;

export const fromModelDate = (value: LDate): number =>
	Temporal.Instant.from(value).epochMilliseconds;

// Compares the candidate's date parts, in the device's zone, with the
// filter's as written. Without criteria the two must be the same instant.
export const dateMatchesCriteria = (
	candidate: number,
	filterDate: LDate,
	criteria?: LDateMatchCriteria,
): boolean => {
	const candidateParts = parseDateParts(toModelDate(candidate));
	const filterParts = parseDateParts(filterDate);
	if (!candidateParts || !filterParts) {
		return false;
	}

	const hasScopedCriteria =
		criteria && Object.values(criteria).some((value) => value === true);
	if (!hasScopedCriteria) {
		return (
			Math.floor(candidate / 1000) * 1000 === fromModelDate(filterDate)
		);
	}

	if (criteria.year && candidateParts.year !== filterParts.year) {
		return false;
	}
	if (criteria.month && candidateParts.month !== filterParts.month) {
		return false;
	}
	if (criteria.day && candidateParts.day !== filterParts.day) {
		return false;
	}
	if (criteria.hour && candidateParts.hour !== filterParts.hour) {
		return false;
	}
	if (criteria.minute && candidateParts.minute !== filterParts.minute) {
		return false;
	}
	if (criteria.second && candidateParts.second !== filterParts.second) {
		return false;
	}
	return true;
};
