import { LTASK_PRIORITY, LTASK_SCHEDULE_TYPE, LRECURRING_TYPE } from '../enums.js';
import { LTaskInsert, LRecurringInfo, LDate, LTask } from '../types.js';
import { LTimeUtl, LDateUtl } from './datetime.js';
import { capitalize } from './misc.js';

export const getTaskInsert = (): LTaskInsert => {
    return {
        information: '',
        label: '',
        priority: LTASK_PRIORITY.LOW,
        finishDate: null,
        schedule: {
            deadlineInfo: null,
            recurringInfo: null,
            type: LTASK_SCHEDULE_TYPE.ADHOC,
        },
    };
};

export const getTargetDateFromRecurringInfo = (recurringInfo: LRecurringInfo): LDate => {
    const { type, time, weekDay, day, month } = recurringInfo;
    let date: LDate = LTimeUtl.from(time).toDate();
    if (type === LRECURRING_TYPE.WEEKLY) {
        date = LDateUtl.setWeekDay(date, weekDay);
    } else if (type === LRECURRING_TYPE.MONTHLY) {
        date = LDateUtl.setDay(date, day);
    } else if (type === LRECURRING_TYPE.YEARLY) {
        date = LDateUtl.setMonth(date, month);
        date = LDateUtl.setDay(date, day);
    }
    return date;
};

export const getNextTargetDateFromRecurringInfo = (recurringInfo: LRecurringInfo): LDate => {
    let date = getTargetDateFromRecurringInfo(recurringInfo);

    if (LDateUtl.from(date).lt(LDateUtl.getNow())) {
        const { type } = recurringInfo;
        if (type === LRECURRING_TYPE.DAILY) date = LDateUtl.shiftDay(date, 1);
        else if (type === LRECURRING_TYPE.WEEKLY) date = LDateUtl.shiftDay(date, 7);
        else if (type === LRECURRING_TYPE.MONTHLY) date = LDateUtl.shiftMonth(date, 1);
        else if (type === LRECURRING_TYPE.YEARLY) date = LDateUtl.shiftYear(date, 1);
    }
    return date;
};

export const getStartIntervalDateFromRecurringInfo = (recurringInfo: LRecurringInfo): LDate => {
    const { type } = recurringInfo;
    let date: LDate = LDateUtl.getNow();
    date = LDateUtl.setHour(date, 0);
    date = LDateUtl.setMinute(date, 0);
    date = LDateUtl.setSecond(date, 0);

    if (type === LRECURRING_TYPE.WEEKLY) {
        date = LDateUtl.setWeekDay(date, 0);
    } else if (type === LRECURRING_TYPE.MONTHLY) {
        date = LDateUtl.setDay(date, 1);
    } else if (type === LRECURRING_TYPE.YEARLY) {
        date = LDateUtl.setDay(date, 1);
        date = LDateUtl.setMonth(date, 0);
    }
    return date;
};

export const getEndIntervalDateFromRecurringInfo = (recurringInfo: LRecurringInfo): LDate => {
    const { type } = recurringInfo;
    let date: LDate = LDateUtl.getNow();
    LDateUtl.setHour(date, 23);
    LDateUtl.setMinute(date, 59);
    LDateUtl.setSecond(date, 59);
    if (type === LRECURRING_TYPE.WEEKLY) {
        date = LDateUtl.setWeekDay(date, 6);
    } else if (type === LRECURRING_TYPE.MONTHLY) {
        date = LDateUtl.setDay(date, 28);
    } else if (type === LRECURRING_TYPE.YEARLY) {
        date = LDateUtl.setDay(date, 28);
        date = LDateUtl.setMonth(date, 11);
    }
    return date;
};

export const getPrettyRecurringInfo = (recurringInfo: LRecurringInfo): string => {
    const { type, time, weekDay, day, month } = recurringInfo;

    const prettyTime = LTimeUtl.getPrettyTime(time);

    switch (type) {
        case LRECURRING_TYPE.DAILY:
            return `Daily at ${prettyTime}`;
        case LRECURRING_TYPE.WEEKLY:
            return `Weekly on ${LDateUtl.getWeekDayName(weekDay)} at ${prettyTime}`;
        case LRECURRING_TYPE.MONTHLY:
            return `Monthly on ${capitalize(LDateUtl.getPrettyDay(day))} at ${prettyTime}`;
        case LRECURRING_TYPE.YEARLY:
            return `Yearly on ${LDateUtl.getMonthName(month)} ${capitalize(
                LDateUtl.getPrettyDay(day)
            )} at ${prettyTime}`;
        default:
            return 'None';
    }
};

export const searchTasksByText = (tasks: Array<LTask>, textToSearchWith: string): Array<LTask> => {
    const filteredTasks = tasks.filter(
        (task) =>
            task.information.toLowerCase().includes(textToSearchWith.toLowerCase()) ||
            task.label.toLowerCase().includes(textToSearchWith.toLowerCase())
    );
    return filteredTasks;
};

export const isTaskActive = (task: LTask): boolean => {
    const now = LDateUtl.getNow();
    switch (task.schedule.type) {
        case LTASK_SCHEDULE_TYPE.ADHOC:
            return task.finishDate === null;
        case LTASK_SCHEDULE_TYPE.DUE:
            return (
                task.finishDate === null &&
                LDateUtl.from(task.schedule.deadlineInfo.deadlineDate).gte(now)
            );
        case LTASK_SCHEDULE_TYPE.RECURRING:
            const target = getTargetDateFromRecurringInfo(task.schedule.recurringInfo);
            const intervalStart = getStartIntervalDateFromRecurringInfo(
                task.schedule.recurringInfo
            );
            return (
                LDateUtl.from(target).gte(now) &&
                (task.finishDate === null || LDateUtl.from(task.finishDate).lt(intervalStart))
            );
        default:
            return false;
    }
};

export const isTaskFinished = (task: LTask): boolean => {
    switch (task.schedule.type) {
        case LTASK_SCHEDULE_TYPE.ADHOC:
        case LTASK_SCHEDULE_TYPE.DUE:
            return task.finishDate !== null;
        case LTASK_SCHEDULE_TYPE.RECURRING:
            const intervalStart = getStartIntervalDateFromRecurringInfo(
                task.schedule.recurringInfo
            );
            return task.finishDate !== null && LDateUtl.from(task.finishDate).gte(intervalStart);
        default:
            return false;
    }
};
