import {
	LLINK_TYPE,
	LTASK_PRIORITY,
	LTASK_SCHEDULE_TYPE,
} from "little-shared/enums";
import { LReminder, LTask, LVBMPreview, LVisualBM } from "little-shared/types";
import { LDateUtl } from "little-shared/utils/datetime";
import { db } from "../utils/db";
import {
	isTargetDateReached,
	shouldNotifyNow,
} from "../../../../packages/shared/src/utils/reminder";
import {
	getNextTargetDateFromRecurringInfo,
	getTargetDateFromRecurringInfo,
} from "little-shared/utils/task";
import { deleteReminder, updateReminder } from "./reminder";
import { deleteLink } from "./link";

export const createNotifications = async (): Promise<void> => {
	const reminders = await db.reminderTbl.toArray();
	for (const reminder of reminders) {
		const reminderLinks = await db.linkTbl
			.where("reminderId")
			.equals(reminder.id)
			.toArray();
		const vbmLinks = reminderLinks.filter(
			(link) => link.type === LLINK_TYPE.REMINDER_VBM,
		);
		const taskLink = reminderLinks.find(
			(link) => link.type === LLINK_TYPE.REMINDER_TASK,
		);

		if (isTargetDateReached(reminder)) {
			if (taskLink) {
				if (taskLink.type !== LLINK_TYPE.REMINDER_TASK) {
					continue;
				}
				const task = taskLink
					? await db.taskTbl.get(taskLink.taskId)
					: undefined;
				if (task) {
					await createTaskReminderNotification(task);
					if (task.schedule.type === LTASK_SCHEDULE_TYPE.RECURRING) {
						await updateReminder(reminder.id, {
							targetDate: getNextTargetDateFromRecurringInfo(
								task.schedule.recurringInfo,
							),
							lastNotificationDate: LDateUtl.getNow(),
						});
						continue;
					}
				}
				await deleteLink(taskLink);
			} else {
				if (vbmLinks.length > 0) {
					for (const vbmLink of vbmLinks) {
						if (vbmLink.type !== LLINK_TYPE.REMINDER_VBM) {
							continue;
						}
						const vbm = await db.visualBMTbl.get(vbmLink.vbmId);
						if (vbm) {
							const vbmPreview = await db.vbmPreviewTbl.get(
								vbm.id,
							);
							await createVBMReminderNotification(
								vbm,
								vbmPreview,
								reminder,
							);
						}
						await deleteLink(vbmLink);
					}
				} else {
					await createReminderNotification(reminder);
				}
				await deleteReminder(reminder.id);
			}
		} else if (shouldNotifyNow(reminder)) {
			if (taskLink) {
				if (taskLink.type !== LLINK_TYPE.REMINDER_TASK) {
					continue;
				}
				const task = taskLink
					? await db.taskTbl.get(taskLink.taskId)
					: undefined;
				if (task) {
					await createTaskReminderNotification(task);
				} else {
					await deleteLink(taskLink);
					continue;
				}
			} else {
				if (vbmLinks.length > 0) {
					for (const vbmLink of vbmLinks) {
						if (vbmLink.type !== LLINK_TYPE.REMINDER_VBM) {
							continue;
						}
						const vbm = await db.visualBMTbl.get(vbmLink.vbmId);
						if (vbm) {
							const vbmPreview = await db.vbmPreviewTbl.get(
								vbm.id,
							);
							await createVBMReminderNotification(
								vbm,
								vbmPreview,
								reminder,
							);
						} else {
							await deleteLink(vbmLink);
						}
					}
				} else {
					await createReminderNotification(reminder);
				}
			}
			await updateReminder(reminder.id, {
				lastNotificationDate: LDateUtl.getNow(),
			});
		}
	}
};

export const createTaskReminderNotification = async (
	task: LTask,
): Promise<void> => {
	let targetDate = LDateUtl.getNow();
	if (task.schedule.type === LTASK_SCHEDULE_TYPE.DUE) {
		targetDate = task.schedule.deadlineInfo.deadlineDate;
	}
	if (task.schedule.type === LTASK_SCHEDULE_TYPE.RECURRING) {
		targetDate = getTargetDateFromRecurringInfo(
			task.schedule.recurringInfo,
		);
	}
	let priority: number;
	switch (task.priority) {
		case LTASK_PRIORITY.LOW: {
			priority = 0;
			break;
		}
		case LTASK_PRIORITY.MEDIUM: {
			priority = 1;
			break;
		}
		case LTASK_PRIORITY.HIGH: {
			priority = 2;
			break;
		}
	}
	await createChromeNativeNotification({
		id: `taskReminder${LDateUtl.getNow()}::${task.id}`,
		message: `${task.information} (${task.label})\nDue: ${LDateUtl.getPrettyDate(targetDate)}`,
		priority,
	});
};

const blobToDataUrl = (blob: Blob): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
};

export const createVBMReminderNotification = async (
	vbm: LVisualBM,
	vbmPreview: LVBMPreview | undefined,
	reminder: LReminder,
): Promise<void> => {
	const imageUrl = vbmPreview
		? await blobToDataUrl(vbmPreview.blob)
		: undefined;
	await createChromeNativeNotification({
		id: `vbmReminder${LDateUtl.getNow()}::${vbm.url}`,
		message: reminder.message,
		priority: 1,
		imageUrl,
		showOpen: true,
	});
};

export const createReminderNotification = async (
	reminder: LReminder,
): Promise<void> => {
	await createChromeNativeNotification({
		id: `reminder${LDateUtl.getNow()}::${reminder.id}`,
		message: reminder.message,
		priority: 1,
	});
};

export const createChromeNativeNotification = async ({
	id,
	message,
	priority,
	imageUrl,
	showOpen,
}: {
	id: string;
	message: string;
	priority: number;
	imageUrl?: string;
	showOpen?: boolean;
}): Promise<void> => {
	const options: chrome.notifications.NotificationOptions<true> = {
		type: imageUrl ? "image" : "basic",
		iconUrl: "/images/ll-icon-128.png",
		imageUrl,
		title: "Little Later",
		message,
		isClickable: true,
		requireInteraction: true,
		priority,
		buttons: showOpen
			? [
					{
						title: "Close",
					},
					{
						title: "Open Website",
					},
				]
			: undefined,
	};
	chrome.notifications.create(id, options, (notificationId) => {
		if (chrome.runtime.lastError) {
			console.error(
				`Failed to create notification with id ${id}: ${chrome.runtime.lastError.message}`,
			);
		} else {
			console.log(`Notification created with id: ${notificationId}`);
		}
	});
};
