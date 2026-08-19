import { describe, expect, it } from "vitest";
import {
	LMERIDEUM,
	LRECURRING_TYPE,
	LREMINDER_TYPE,
	LTASK_PRIORITY,
	LTASK_SCHEDULE_TYPE,
} from "little-shared/enums";
import { LDateUtl } from "little-shared/utils/datetime";
import { shouldNotifyNow } from "little-shared/utils/reminder";
import {
	getEndIntervalDateFromRecurringInfo,
	isTaskActive,
	isTaskFinished,
} from "little-shared/utils/task";
import type { LReminder, LTask } from "little-shared/types";

describe("12-hour hour conversion", () => {
	it("stores 12 AM as hour 0 and 3 PM as hour 15", () => {
		const morning = LDateUtl.setHour(LDateUtl.getNow(), 10);
		const am = LDateUtl.setHour12HF(morning, 12);
		expect(LDateUtl.getHour(am)).toBe(0);
		expect(LDateUtl.getMerideum(am)).toBe(LMERIDEUM.AM);

		const afternoon = LDateUtl.setHour(LDateUtl.getNow(), 15);
		const pm = LDateUtl.setHour12HF(afternoon, 3);
		expect(LDateUtl.getHour(pm)).toBe(15);
		expect(LDateUtl.getMerideum(pm)).toBe(LMERIDEUM.PM);
	});

	it("keeps 12 PM as noon instead of rolling to midnight", () => {
		const afternoon = LDateUtl.setHour(LDateUtl.getNow(), 15);
		const noon = LDateUtl.setHour12HF(afternoon, 12);
		expect(LDateUtl.getHour(noon)).toBe(12);
		expect(LDateUtl.getMerideum(noon)).toBe(LMERIDEUM.PM);
	});
});

describe("escalating reminders", () => {
	it("does not send midpoint notifications for normal reminders", () => {
		const reminder: LReminder = {
			id: 1,
			message: "Ping",
			type: LREMINDER_TYPE.NORMAL,
			targetDate: LDateUtl.shiftHour(LDateUtl.getNow(), 4),
			lastNotificationDate: LDateUtl.shiftHour(LDateUtl.getNow(), -4),
		};
		expect(shouldNotifyNow(reminder)).toBe(false);
	});
});

describe("recurring interval helpers", () => {
	it("applies end-of-day setters instead of discarding them", () => {
		const end = getEndIntervalDateFromRecurringInfo({
			type: LRECURRING_TYPE.DAILY,
			time: "09:00:00+00:00",
			day: null,
			month: null,
			weekDay: null,
		});
		expect(LDateUtl.getHour(end)).toBe(23);
		expect(LDateUtl.getMinute(end)).toBe(59);
		expect(LDateUtl.getSecond(end)).toBe(59);
	});
});

describe("task finish classification", () => {
	const dueTask = (finishDate: LTask["finishDate"]): LTask => ({
		id: 1,
		information: "Review export password flow",
		label: "Export review",
		priority: LTASK_PRIORITY.HIGH,
		finishDate,
		schedule: {
			type: LTASK_SCHEDULE_TYPE.DUE,
			deadlineInfo: {
				deadlineDate: LDateUtl.shiftDay(LDateUtl.getNow(), 1),
			},
			recurringInfo: null,
		},
	});

	it("treats a missing finish date as active, not finished", () => {
		const task = dueTask(undefined as unknown as null);
		expect(isTaskFinished(task)).toBe(false);
		expect(isTaskActive(task)).toBe(true);
	});

	it("treats an explicit null finish date as active", () => {
		const task = dueTask(null);
		expect(isTaskFinished(task)).toBe(false);
		expect(isTaskActive(task)).toBe(true);
	});
});
