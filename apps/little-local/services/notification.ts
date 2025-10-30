import path from 'path';
import { db } from '../db';
import { LLINK_TYPE, LTASK_SCHEDULE_TYPE } from 'little-shared/enums';
import {
    LReminder,
    LReminderTaskLink,
    LReminderVBMLink,
    LVisualBM,
    LTask,
} from 'little-shared/types';
import { LDateUtl } from 'little-shared/utils/datetime';
import { isTargetDateReached, shouldNotifyNow } from 'little-shared/utils/reminder';
import {
    getNextTargetDateFromRecurringInfo,
    getTargetDateFromRecurringInfo,
} from 'little-shared/utils/task';
import { deleteLink } from './link';
import { updateReminder, deleteReminder } from './reminder';
import { getTask } from './task';
import { getVisualBM } from './visualBM';
import { Notification, shell } from 'electron';

export const createNotifications = (): void => {
    const reminders = db.prepare('SELECT * FROM reminderTbl').all() as LReminder[];
    for (const reminder of reminders) {
        const taskLink = db
            .prepare('SELECT * FROM linkTbl WHERE reminderId = ? AND type = ?')
            .get(reminder.id, LLINK_TYPE.REMINDER_TASK) as LReminderTaskLink | undefined;
        const vbmLinks = db
            .prepare('SELECT * FROM linkTbl WHERE reminderId = ? AND type = ?')
            .all(reminder.id, LLINK_TYPE.REMINDER_VBM) as LReminderVBMLink[];
        if (isTargetDateReached(reminder)) {
            if (taskLink) {
                const task = getTask(taskLink.taskId);
                if (task) {
                    createTaskReminderNotification(task);
                    if (task.schedule.type === LTASK_SCHEDULE_TYPE.RECURRING) {
                        updateReminder(reminder.id, {
                            targetDate: getNextTargetDateFromRecurringInfo(
                                task.schedule.recurringInfo
                            ),
                            lastNotificationDate: LDateUtl.getNow(),
                        });
                        continue;
                    }
                }
                deleteLink(taskLink);
            } else if (vbmLinks.length > 0) {
                for (const vbmLink of vbmLinks) {
                    const vbm = getVisualBM(vbmLink.vbmId);
                    if (vbm) {
                        createVBMReminderNotification(vbm, reminder);
                    }
                    deleteLink(vbmLink);
                }
            } else {
                createReminderNotification(reminder);
                deleteReminder(reminder.id);
            }
        } else if (shouldNotifyNow(reminder)) {
            if (taskLink) {
                const task = getTask(taskLink.taskId);
                if (task) {
                    createTaskReminderNotification(task);
                } else {
                    deleteLink(taskLink);
                    continue;
                }
            } else if (vbmLinks.length > 0) {
                for (const vbmLink of vbmLinks) {
                    const vbm = getVisualBM(vbmLink.vbmId);
                    if (vbm) {
                        createVBMReminderNotification(vbm, reminder);
                    } else {
                        deleteLink(vbmLink);
                    }
                }
            } else {
                createReminderNotification(reminder);
            }
            updateReminder(reminder.id, {
                lastNotificationDate: LDateUtl.getNow(),
            });
        }
    }
};

const createNativeNotification = (options: { title: string; body: string; openUrl?: string }) => {
    if (!Notification.isSupported()) {
        console.warn('Notifications are not supported on this system.');
        return;
    }
    const notification = new Notification({
        title: options.title,
        body: options.body,
        icon: path.join(__dirname, '../assets/icon.ico'),
    });

    if (options.openUrl !== undefined) {
        notification.on('click', () => {
            shell.openExternal(options.openUrl!);
        });
    }

    notification.show();
};

export const createReminderNotification = (reminder: LReminder): void => {
    createNativeNotification({
        title: 'Little Later: Reminder',
        body: reminder.message,
    });
};

export const createVBMReminderNotification = (vbm: LVisualBM, reminder: LReminder): void => {
    createNativeNotification({
        title: 'Little Later: Reminder',
        body: reminder.message,
        openUrl: vbm.url,
    });
};

export const createTaskReminderNotification = (task: LTask): void => {
    let targetDate = '';
    if (task.schedule.type === LTASK_SCHEDULE_TYPE.DUE) {
        targetDate = task.schedule.deadlineInfo.deadlineDate;
    }
    if (task.schedule.type === LTASK_SCHEDULE_TYPE.RECURRING) {
        targetDate = getTargetDateFromRecurringInfo(task.schedule.recurringInfo);
    }

    createNativeNotification({
        title: 'Little Later: Task Reminder',
        body: `${task.information} (${task.label})\nDue Date: ${targetDate}`,
    });
};
