import { LLINK_TYPE } from 'little-shared/enums.js';
import { LLink, LReminder, LReminderInsert } from 'little-shared/types';
import { db } from '../db.js';
import { createLink, deleteLink } from './link.js';
import { LDateUtl } from 'little-shared/utils/datetime.js';

export const getReminder = (id: number): LReminder | undefined => {
    return db.prepare('SELECT * FROM reminderTbl WHERE id = ?').get(id) as LReminder | undefined;
};

export const getReminders = (): LReminder[] => {
    const sql = 'SELECT * FROM reminderTbl';
    const rows = db.prepare(sql).all() as LReminder[];
    return rows;
};

export const deleteReminder = (id: number): void => {
    const reminder = getReminder(id);
    if (!reminder) {
        throw new Error(`Reminder with id ${id} not found`);
    }

    const reminderLinks = db
        .prepare('SELECT * FROM linkTbl WHERE reminderId = ?')
        .all(id) as LLink[];

    for (const link of reminderLinks) {
        if (link.type !== LLINK_TYPE.REMINDER_TASK) {
            deleteLink(link);
        }
    }

    db.prepare('DELETE FROM reminderTbl WHERE id = ?').run(id);
};

export const createReminder = (reminderInsert: LReminderInsert): number => {
    const params = {
        ...reminderInsert,
        lastNotificationDate: LDateUtl.getNow(),
    };
    const sql = `
        INSERT INTO reminderTbl (message, targetDate, type, lastNotificationDate)
        VALUES (@message, @targetDate, @type, @lastNotificationDate)
    `;
    const info = db.prepare(sql).run(params);
    return Number(info.lastInsertRowid);
};

export const putReminder = (
    reminderInsert: LReminderInsert,
    vbmInsertIds: Array<number>,
    vbmDeleteIds: Array<number>
): number => {
    let reminderId: number;
    if (reminderInsert.id) {
        reminderId = reminderInsert.id;
        const { id, ...updateData } = {
            ...reminderInsert,
            lastNotificationDate: LDateUtl.getNow(),
        };

        if (Object.keys(updateData).length > 0) {
            const setClause = Object.keys(updateData)
                .map((key) => `${key} = @${key}`)
                .join(', ');
            const params = { ...updateData, id };
            const sql = `UPDATE reminderTbl SET ${setClause} WHERE id = @id`;
            db.prepare(sql).run(params);
        }
    } else {
        const params = {
            ...reminderInsert,
            lastNotificationDate: LDateUtl.getNow(),
        };
        const sql = `
            INSERT INTO reminderTbl (message, targetDate, type, lastNotificationDate)
            VALUES (@message, @targetDate, @type, @lastNotificationDate)
        `;
        const info = db.prepare(sql).run(params);
        reminderId = Number(info.lastInsertRowid);
    }

    for (const vbmId of vbmInsertIds) {
        createLink({
            type: LLINK_TYPE.REMINDER_VBM,
            reminderId,
            vbmId,
        });
    }

    for (const vbmId of vbmDeleteIds) {
        deleteLink({
            type: LLINK_TYPE.REMINDER_VBM,
            reminderId,
            vbmId,
        });
    }

    return reminderId;
};

export const updateReminder = (id: number, modifications: Partial<LReminder>): void => {
    const { id: _, ...updateData } = modifications;
    if (Object.keys(updateData).length === 0) {
        return;
    }
    const setClause = Object.keys(updateData)
        .map((key) => `${key} = @${key}`)
        .join(', ');
    const params = {
        ...updateData,
        id,
    };
    const sql = `UPDATE reminderTbl SET ${setClause} WHERE id = @id`;
    db.prepare(sql).run(params);
};
