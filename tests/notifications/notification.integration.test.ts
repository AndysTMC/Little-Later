import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	LLINK_TYPE,
	LREMINDER_TYPE,
	LTASK_PRIORITY,
	LTASK_SCHEDULE_TYPE,
} from "little-shared/enums";
import { db } from "../../src/utils/db";
import {
	createChromeNativeNotification,
	createNotifications,
} from "../../src/services/notification";

describe("notification service", () => {
	const consoleWarnSpy = vi
		.spyOn(console, "warn")
		.mockImplementation(() => undefined);

	beforeEach(async () => {
		await db.delete();
		await db.open();

		Object.defineProperty(globalThis, "chrome", {
			configurable: true,
			value: {
				notifications: {
					create: vi.fn(
						(
							_: string,
							__: chrome.notifications.NotificationOptions<true>,
							callback?: (notificationId: string) => void,
						) => {
							callback?.("created-id");
						},
					),
				},
				runtime: {
					getURL: vi.fn(
						(path: string) => `chrome-extension://test/${path}`,
					),
					lastError: undefined,
				},
			},
		});
	});

	afterEach(() => {
		consoleWarnSpy.mockClear();
	});

	it("falls back to a basic notification when image notification creation fails", async () => {
		const createMock = vi
			.fn()
			.mockImplementationOnce(
				(
					_: string,
					__: chrome.notifications.NotificationOptions<true>,
					callback?: (notificationId: string) => void,
				) => {
					(
						globalThis.chrome.runtime as typeof chrome.runtime & {
							lastError: { message: string } | undefined;
						}
					).lastError = {
						message: "Image notifications unavailable",
					};
					callback?.("");
					(
						globalThis.chrome.runtime as typeof chrome.runtime & {
							lastError: { message: string } | undefined;
						}
					).lastError = undefined;
				},
			)
			.mockImplementationOnce(
				(
					_: string,
					__: chrome.notifications.NotificationOptions<true>,
					callback?: (notificationId: string) => void,
				) => {
					callback?.("created-id");
				},
			);

		globalThis.chrome.notifications.create = createMock;

		await createChromeNativeNotification({
			id: "vbmReminder::1",
			imageUrl: "data:image/jpeg;base64,abc",
			message: "Open this later",
			priority: 1,
			showOpen: true,
		});

		expect(createMock).toHaveBeenCalledTimes(2);
		expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
		expect(createMock.mock.calls[0][1].type).toBe("image");
		expect(createMock.mock.calls[1][1].type).toBe("basic");
	});

	it("sends only one due task reminder notification and cleans up the reminder", async () => {
		const taskId = await db.taskTbl.add({
			finishDate: null,
			information: "Pay rent",
			label: "Finance",
			priority: LTASK_PRIORITY.HIGH,
			schedule: {
				deadlineInfo: {
					deadlineDate: "2026-04-05T10:00:00+05:30",
				},
				recurringInfo: null,
				type: LTASK_SCHEDULE_TYPE.DUE,
			},
		});

		const reminderId = await db.reminderTbl.add({
			lastNotificationDate: "2026-04-05T09:00:00+05:30",
			message: "Rent due",
			targetDate: "2026-04-05T10:00:00+05:30",
			type: LREMINDER_TYPE.NORMAL,
		});

		await db.linkTbl.add({
			id: 1,
			noteId: null,
			reminderId,
			taskId,
			type: LLINK_TYPE.REMINDER_TASK,
			vbmId: null,
		});

		await createNotifications();

		expect(globalThis.chrome.notifications.create).toHaveBeenCalledTimes(1);
		const remainingReminder = await db.reminderTbl.get(reminderId);
		const remainingLinks = await db.linkTbl.toArray();
		expect(remainingReminder).toBeUndefined();
		expect(remainingLinks).toHaveLength(0);
	});
});
