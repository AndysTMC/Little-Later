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
} from "little-shared/utils/reminder";
import {
	getNextTargetDateFromRecurringInfo,
	getTargetDateFromRecurringInfo,
} from "little-shared/utils/task";
import { deleteReminder, updateReminder } from "./reminder";
import { deleteLink } from "./link";

export const createNotifications = async (): Promise<void> => {
	const reminders = await db.reminderTbl.toArray();
	for (const reminder of reminders) {
		try {
			// Process each reminder independently so one broken record never blocks
			// the rest of the notification queue.
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
						if (
							task.schedule.type === LTASK_SCHEDULE_TYPE.RECURRING
						) {
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
					continue;
				}

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
		} catch (error) {
			console.error(
				`Failed to process reminder notification ${reminder.id}.`,
				error,
			);
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

// Build a worker-safe data URL so Chrome can show VBM previews in notifications.
const blobToDataUrl = (blob: Blob): Promise<string> => {
	return blob.arrayBuffer().then((buffer) => {
		let binary = "";
		const bytes = new Uint8Array(buffer);
		for (let index = 0; index < bytes.length; index += 1) {
			binary += String.fromCharCode(bytes[index]);
		}
		return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
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
	// Chrome rejects some image notifications depending on platform/state. We
	// retry once as a plain basic notification so reminders are still delivered.
	const createWithOptions = async (
		options: chrome.notifications.NotificationOptions<true>,
	): Promise<void> => {
		await new Promise<void>((resolve, reject) => {
			chrome.notifications.create(id, options, (notificationId) => {
				if (chrome.runtime.lastError) {
					reject(
						new Error(
							chrome.runtime.lastError.message ??
								`Failed to create notification ${id}.`,
						),
					);
					return;
				}
				void notificationId;
				resolve();
			});
		});
	};

	const options: chrome.notifications.NotificationOptions<true> = {
		type: imageUrl ? "image" : "basic",
		iconUrl: chrome.runtime.getURL("images/ll-icon-128.png"),
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

	try {
		await createWithOptions(options);
	} catch (error) {
		if (imageUrl) {
			console.warn(
				`Image notification ${id} failed. Retrying without preview image.`,
				error,
			);
			await createWithOptions({
				...options,
				imageUrl: undefined,
				type: "basic",
			});
			return;
		}
		throw error;
	}
};
