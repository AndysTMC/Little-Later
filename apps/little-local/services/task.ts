import { db } from '../db.js';
import { LREMINDER_TYPE, LLINK_TYPE, LTASK_SCHEDULE_TYPE } from 'little-shared/enums.js';
import { LTask, LTaskInsert, LReminderTaskLink, LLink } from 'little-shared/types.js';
import { getNextTargetDateFromRecurringInfo } from 'little-shared/utils/task.js';
import { createLink, deleteLink } from './link.js';

export const getTask = (id: number): LTask | undefined => {
    const sql = `SELECT * FROM taskTbl WHERE id = ?`;
    const taskRow = db.prepare(sql).get(id) as
        | (Omit<LTask, 'schedule'> & { schedule: string })
        | undefined;

    if (!taskRow) {
        return undefined;
    }

    try {
        return {
            ...taskRow,
            schedule: JSON.parse(taskRow.schedule),
        };
    } catch (e) {
        console.error(`Failed to parse schedule for task ID ${id}:`, taskRow.schedule);
        return {
            ...taskRow,
            schedule: {
                type: LTASK_SCHEDULE_TYPE.ADHOC,
                deadlineInfo: null,
                recurringInfo: null,
            },
        };
    }
};

export const getTasks = (): LTask[] => {
    const sql = `SELECT * FROM taskTbl`;
    const rows = db.prepare(sql).all() as (Omit<LTask, 'schedule'> & { schedule: string })[];

    return rows.map((row) => {
        try {
            return {
                ...row,
                schedule: JSON.parse(row.schedule),
            };
        } catch (e) {
            console.error(`Failed to parse schedule for task ID ${row.id}:`, row.schedule);
            return {
                ...row,
                schedule: {
                    type: LTASK_SCHEDULE_TYPE.ADHOC,
                    deadlineInfo: null,
                    recurringInfo: null,
                },
            };
        }
    });
};

export const createTask = (taskInsert: LTaskInsert): number => {
    const params = {
        information: taskInsert.information,
        label: taskInsert.label,
        priority: taskInsert.priority,
        schedule: JSON.stringify(taskInsert.schedule),
        finishDate: taskInsert.finishDate ?? null,
    };

    const sql = `
    INSERT INTO taskTbl (information, label, priority, finishDate, schedule)
    VALUES (@information, @label, @priority, @finishDate, @schedule)
  `;

    const info = db.prepare(sql).run(params);
    return Number(info.lastInsertRowid);
};

export const putTask = (
    taskInsert: LTaskInsert,
    vbmInsertIds: Array<number>,
    vbmDeleteIds: Array<number>,
    reminderType?: LREMINDER_TYPE
): number => {
    let taskId: number;
    const scheduleString = JSON.stringify(taskInsert.schedule);

    if (taskInsert.id) {
        taskId = taskInsert.id;
        const { id, ...updateData } = taskInsert;
        const params = {
            ...updateData,
            schedule: scheduleString,
            id: taskId,
        };
        const setClause = Object.keys(params)
            .filter((key) => key !== 'id')
            .map((key) => `${key} = @${key}`)
            .join(', ');
        if (setClause) {
            db.prepare(`UPDATE taskTbl SET ${setClause} WHERE id = @id`).run(params);
        }
    } else {
        const params = {
            ...taskInsert,
            schedule: scheduleString,
            finishDate: taskInsert.finishDate ?? null,
        };
        const sql = `INSERT INTO taskTbl (information, label, priority, finishDate, schedule) VALUES (@information, @label, @priority, @finishDate, @schedule)`;
        const info = db.prepare(sql).run(params);
        taskId = Number(info.lastInsertRowid);
        taskInsert.id = taskId;
    }

    // Link handling is now outside any transaction wrapper.
    for (const vbmId of vbmInsertIds) {
        createLink({ type: LLINK_TYPE.TASK_VBM, taskId, vbmId });
    }
    for (const vbmId of vbmDeleteIds) {
        deleteLink({ type: LLINK_TYPE.TASK_VBM, taskId, vbmId });
    }

    const reminderLink = db
        .prepare('SELECT * FROM linkTbl WHERE taskId = ? AND type = ?')
        .get(taskId, LLINK_TYPE.REMINDER_TASK) as LReminderTaskLink | undefined;

    switch (taskInsert.schedule.type) {
        case LTASK_SCHEDULE_TYPE.ADHOC:
            if (reminderLink) {
                deleteLink(reminderLink);
            }
            break;
        case LTASK_SCHEDULE_TYPE.DUE:
        case LTASK_SCHEDULE_TYPE.RECURRING:
            if (reminderLink && reminderType === undefined) {
                deleteLink(reminderLink);
            }
            if (reminderType !== undefined) {
                const targetDate = taskInsert.schedule.deadlineInfo
                    ? taskInsert.schedule.deadlineInfo.deadlineDate
                    : getNextTargetDateFromRecurringInfo(taskInsert.schedule.recurringInfo);

                if (reminderLink) {
                    const reminderId = reminderLink.reminderId;
                    db.prepare(
                        'UPDATE reminderTbl SET message = @message, type = @type, targetDate = @targetDate WHERE id = @id'
                    ).run({
                        message: `Integrated with task ${taskId}`,
                        type: reminderType,
                        targetDate,
                        id: reminderId,
                    });
                } else {
                    const info = db
                        .prepare(
                            'INSERT INTO reminderTbl (message, type, targetDate) VALUES (@message, @type, @targetDate)'
                        )
                        .run({
                            message: `Integrated with task ${taskId}`,
                            type: reminderType,
                            targetDate,
                        });
                    const reminderId = Number(info.lastInsertRowid);

                    createLink({
                        type: LLINK_TYPE.REMINDER_TASK,
                        reminderId,
                        taskId,
                    });
                }
            }
            break;
    }
    return taskId;
};

export const updateTask = (id: number, modifications: Partial<LTask>): void => {
    const { id: _, ...updateData } = modifications;
    if (Object.keys(updateData).length === 0) {
        return;
    }
    const params: Record<string, any> = { ...updateData, id };
    if (params.schedule) {
        params.schedule = JSON.stringify(params.schedule);
    }
    const setClause = Object.keys(updateData)
        .map((key) => `${key} = @${key}`)
        .join(', ');
    const sql = `UPDATE taskTbl SET ${setClause} WHERE id = @id`;
    db.prepare(sql).run(params);
};

export const deleteTask = (id: number): void => {
    const taskExists = db.prepare('SELECT 1 FROM taskTbl WHERE id = ?').get(id);
    if (!taskExists) {
        throw new Error(`Task with id ${id} not found`);
    }

    const taskLinks = db.prepare('SELECT * FROM linkTbl WHERE taskId = ?').all(id) as LLink[];
    for (const link of taskLinks) {
        deleteLink(link);
    }

    db.prepare('DELETE FROM taskTbl WHERE id = ?').run(id);
};
