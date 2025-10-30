import { LLINK_TYPE } from 'little-shared/enums.js';
import { LLinkInsert } from 'little-shared/types.js';
import { db } from '../db.js';
import { deleteNote } from './note.js';
import { deleteReminder } from './reminder.js';

export const createLink = (linkInsert: LLinkInsert): number => {
    switch (linkInsert.type) {
        case LLINK_TYPE.NOTE_VBM: {
            if (linkInsert.noteId === undefined || linkInsert.vbmId === undefined) {
                throw new Error('Note-Save link must have both noteId and vbmId defined');
            } else if (linkInsert.reminderId !== undefined || linkInsert.taskId !== undefined) {
                throw new Error('Note-Save link cannot have reminderId and taskId defined');
            }
            break;
        }
        case LLINK_TYPE.REMINDER_VBM: {
            if (linkInsert.reminderId === undefined || linkInsert.vbmId === undefined) {
                throw new Error('Reminder-Save link must have both reminderId and vbmId defined');
            } else if (linkInsert.noteId !== undefined || linkInsert.taskId !== undefined) {
                throw new Error('Reminder-Save link cannot have noteId and taskId defined');
            }
            break;
        }
        case LLINK_TYPE.REMINDER_TASK: {
            if (linkInsert.reminderId === undefined || linkInsert.taskId === undefined) {
                throw new Error('Reminder-Task link must have both reminderId and taskId defined');
            } else if (linkInsert.noteId !== undefined || linkInsert.vbmId !== undefined) {
                throw new Error('Reminder-Task link cannot have noteId and vbmId defined');
            }
            break;
        }
        case LLINK_TYPE.TASK_VBM: {
            if (linkInsert.taskId === undefined || linkInsert.vbmId === undefined) {
                throw new Error('Save-Task link must have both vbmId and taskId defined');
            } else if (linkInsert.noteId !== undefined || linkInsert.reminderId !== undefined) {
                throw new Error('Save-Task link cannot have noteId and reminderId defined');
            }
            break;
        }
    }
    linkInsert.noteId = linkInsert.noteId ?? null;
    linkInsert.reminderId = linkInsert.reminderId ?? null;
    linkInsert.taskId = linkInsert.taskId ?? null;
    linkInsert.vbmId = linkInsert.vbmId ?? null;
    const sql = `
		INSERT INTO linkTbl (type, noteId, reminderId, taskId, vbmId)
		VALUES (@type, @noteId, @reminderId, @taskId, @vbmId)
	`;
    const info = db.prepare(sql).run(linkInsert);
    return Number(info.lastInsertRowid);
};
export const deleteLink = (linkInsert: LLinkInsert): void => {
    delete linkInsert.id;
    switch (linkInsert.type) {
        case LLINK_TYPE.NOTE_VBM:
            delete linkInsert.reminderId;
            delete linkInsert.taskId;
            deleteNote(linkInsert.noteId);
            break;
        case LLINK_TYPE.REMINDER_TASK:
            delete linkInsert.noteId;
            delete linkInsert.vbmId;
            deleteReminder(linkInsert.reminderId);
            break;
        case LLINK_TYPE.REMINDER_VBM:
            delete linkInsert.noteId;
            delete linkInsert.taskId;
            break;
        case LLINK_TYPE.TASK_VBM:
            delete linkInsert.noteId;
            delete linkInsert.reminderId;
            break;
        default:
            break;
    }
    const whereClause = Object.keys(linkInsert)
        .filter((key) => linkInsert[key as keyof LLinkInsert] !== undefined)
        .map((key) => `${key} = @${key}`)
        .join(' AND ');
    db.prepare(`DELETE FROM linkTbl WHERE ${whereClause}`).run(linkInsert);
};

export const getLinks = (): Array<LLinkInsert> => {
    const sql = `SELECT * FROM linkTbl`;
    return db.prepare(sql).all() as Array<LLinkInsert>;
};
