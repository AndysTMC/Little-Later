import { Request, Response } from 'express';
import { LTaskInsert } from 'little-shared/types';
import { createTask, deleteTask, getTask, getTasks, putTask, updateTask } from '../services/task';
import { DB_CHANGE_KEYS } from '../enums';
import { LREMINDER_TYPE } from 'little-shared/enums';
import { appEmitter } from '../emitter';

export const createTaskEP = async (req: Request, res: Response) => {
    const { taskInsert } = req.body as { taskInsert: LTaskInsert };
    if (!taskInsert) {
        return res.status(400).send('Task data is required');
    }
    const id = createTask(taskInsert);
    res.status(201).json(id);
    appEmitter.emit(DB_CHANGE_KEYS.tasksChange);
};

export const putTaskEP = async (req: Request, res: Response) => {
    const { taskInsert, vbmInsertIds, vbmDeleteIds, reminderType } = req.body as {
        taskInsert: LTaskInsert;
        vbmInsertIds: Array<number>;
        vbmDeleteIds: Array<number>;
        reminderType?: LREMINDER_TYPE;
    };
    if (!taskInsert) {
        return res.status(400).send('Task data is required');
    }
    const id = putTask(taskInsert, vbmInsertIds, vbmDeleteIds, reminderType);
    res.status(200).json(id);
    appEmitter.emit(DB_CHANGE_KEYS.tasksChange);
};

export const updateTaskEP = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { modifications } = req.body as {
        modifications: Partial<LTaskInsert>;
    };
    if (!id) {
        return res.status(400).send('Task ID is required');
    }
    updateTask(parseInt(id, 10), modifications);
    res.sendStatus(204);
    appEmitter.emit(DB_CHANGE_KEYS.tasksChange);
};

export const getTaskEP = async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).send('Task ID is required');
    }
    const task = getTask(parseInt(id, 10));
    if (task) {
        res.status(200).json(task);
    } else {
        res.status(404).send('Task not found');
    }
};

export const getTasksEP = async (req: Request, res: Response) => {
    const tasks = getTasks();
    res.status(200).json(tasks);
};

export const deleteTaskEP = async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).send('Task ID is required');
    }
    deleteTask(parseInt(id, 10));
    res.sendStatus(204);
    appEmitter.emit(DB_CHANGE_KEYS.tasksChange);
};
