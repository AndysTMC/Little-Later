import { Request, Response } from 'express';
import { createLink, deleteLink, getLinks } from '../services/link';
import { LLinkInsert } from 'little-shared/types';
import { LLINK_TYPE } from 'little-shared/enums';
import { appEmitter } from '../emitter';
import { DB_CHANGE_KEYS } from '../enums';

export const createLinkEP = async (req: Request, res: Response) => {
    const { linkInsert } = req.body as { linkInsert: LLinkInsert };
    if (!linkInsert) {
        return res.status(400).send('Link data is required');
    }
    const id = createLink(linkInsert);
    res.status(201).json(id);
    appEmitter.emit(DB_CHANGE_KEYS.linksChange);
};

export const deleteLinkEP = async (req: Request, res: Response) => {
    const { linkInsert } = req.body as { linkInsert: LLinkInsert };
    if (!linkInsert) {
        return res.status(400).send('Link data is required');
    }
    deleteLink(linkInsert);
    res.sendStatus(204);
    appEmitter.emit(DB_CHANGE_KEYS.linksChange);
    if (linkInsert.type === LLINK_TYPE.NOTE_VBM) {
        appEmitter.emit(DB_CHANGE_KEYS.notesChange);
    }
    if (linkInsert.type === LLINK_TYPE.REMINDER_TASK) {
        appEmitter.emit(DB_CHANGE_KEYS.remindersChange);
    }
};

export const getLinksEP = async (req: Request, res: Response) => {
    try {
        const notes = getLinks();
        res.status(200).json(notes);
    } catch (error) {
        console.error('Error retrieving links:', error);
        res.status(500).send('An error occurred while retrieving links');
    }
};
