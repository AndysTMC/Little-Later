import { LREMINDER_TYPE } from '../enums.js';
import { LReminderInsert, LReminder, LDate } from '../types.js';
import { LDateUtl } from './datetime.js';

export const getReminderInsert = (): LReminderInsert => {
    return {
        message: '',
        type: LREMINDER_TYPE.NORMAL,
        targetDate: LDateUtl.getNow(),
    };
};

export const searchRemindersByText = (
    reminders: Array<LReminder>,
    textToSearchWith: string
): Array<LReminder> => {
    const filteredReminders = reminders.filter((reminder) =>
        reminder.message.toLowerCase().includes(textToSearchWith.toLowerCase())
    );
    return filteredReminders;
};

export const isTargetDateReached = (reminder: LReminder): boolean => {
    return LDateUtl.from().gte(reminder.targetDate);
};

export const getNextNotifyingDate = (reminder: LReminder): LDate => {
    const lastNotificationDate = reminder.lastNotificationDate ?? LDateUtl.getNow();
    const targetDate = reminder.targetDate;
    return LDateUtl.middle(lastNotificationDate, targetDate);
};

export const shouldNotifyNow = (reminder: LReminder): boolean => {
    const now = LDateUtl.getNow();
    const { targetDate } = reminder;

    // Already past the target → no notification
    if (LDateUtl.from(now).gte(targetDate)) return false;

    const next = getNextNotifyingDate(reminder);
    const cutoff = LDateUtl.shiftMinute(targetDate, -15);

    const afterNext = LDateUtl.from(now).gte(next);
    const beforeCutoff = LDateUtl.from(now).lt(cutoff);

    return afterNext && beforeCutoff;
};
