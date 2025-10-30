import { Request, Response } from 'express';
import { LReminderInsert } from 'little-shared/types';
import {
    createReminder,
    deleteReminder,
    getReminder,
    getReminders,
    putReminder,
    updateReminder,
} from '../services/reminder';
import { appEmitter } from '../emitter';
import { DB_CHANGE_KEYS } from '../enums';

export const createReminderEP = async (req: Request, res: Response) => {
    const { reminderInsert } = req.body as { reminderInsert: LReminderInsert };
    if (!reminderInsert) {
        return res.status(400).send('Reminder data is required');
    }
    const id = createReminder(reminderInsert);
    res.status(201).json(id);
    appEmitter.emit(DB_CHANGE_KEYS.remindersChange);
};

export const putReminderEP = async (req: Request, res: Response) => {
    console.log('putReminderEP called with body:', req.body);
    const { reminderInsert, vbmInsertIds, vbmDeleteIds } = req.body as {
        reminderInsert: LReminderInsert;
        vbmInsertIds: Array<number>;
        vbmDeleteIds: Array<number>;
    };
    if (!reminderInsert) {
        return res.status(400).send('Reminder data is required');
    }
    const id = putReminder(reminderInsert, vbmInsertIds, vbmDeleteIds);
    res.status(200).json(id);
    appEmitter.emit(DB_CHANGE_KEYS.remindersChange);
};

export const updateReminderEP = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { modifications } = req.body as {
        modifications: Partial<LReminderInsert>;
    };
    if (!id) {
        return res.status(400).send('Reminder ID is required');
    }
    updateReminder(parseInt(id, 10), modifications);
    res.sendStatus(204);
    appEmitter.emit(DB_CHANGE_KEYS.remindersChange);
};

export const getReminderEP = async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).send('Reminder ID is required');
    }
    const reminder = getReminder(parseInt(id, 10));
    if (reminder) {
        res.status(200).json(reminder);
    } else {
        res.status(404).send('Reminder not found');
    }
};

export const getRemindersEP = async (req: Request, res: Response) => {
    const reminders = getReminders();
    res.status(200).json(reminders);
};

export const deleteReminderEP = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    if (!id) {
        return res.status(400).send('Reminder ID is required');
    }
    deleteReminder(parseInt(id, 10));
    res.sendStatus(204);
    appEmitter.emit(DB_CHANGE_KEYS.remindersChange);
};
