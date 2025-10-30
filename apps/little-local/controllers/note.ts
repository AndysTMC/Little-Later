import { Request, Response } from 'express';
import { createNote, deleteNote, getNote, getNotes, updateNote } from '../services/note';
import { LNote, LNoteInsert } from 'little-shared/types';
import { appEmitter } from '../emitter';
import { DB_CHANGE_KEYS } from '../enums';

export const createNoteEP = async (req: Request, res: Response) => {
    const { noteInsert } = req.body as { noteInsert: LNoteInsert };
    console.log(req.body);
    if (!noteInsert) {
        return res.status(400).send('Note data is required');
    }
    try {
        const id = createNote(noteInsert);
        res.status(201).json(id);
        appEmitter.emit(DB_CHANGE_KEYS.notesChange);
    } catch (error) {
        console.error('Error creating note:', error);
        res.status(500).send('An error occurred while creating the note');
    }
};

export const updateNoteEP = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { modifications } = req.body as {
        modifications: Partial<LNote>;
    };
    if (!id) {
        return res.status(400).send('Note ID is required');
    }
    try {
        updateNote(parseInt(id, 10), modifications);
        res.sendStatus(204);
        appEmitter.emit(DB_CHANGE_KEYS.notesChange);
    } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).send('An error occurred while updating the note');
    }
};

export const getNoteEP = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    if (!id) {
        return res.status(400).send('Note ID is required');
    }
    try {
        const note = getNote(parseInt(id, 10));
        if (note) {
            res.status(200).json(note);
        } else {
            res.status(404).send('Note not found');
        }
    } catch (error) {
        console.error('Error retrieving note:', error);
        res.status(500).send('An error occurred while retrieving the note');
    }
};

export const getNotesEP = async (req: Request, res: Response) => {
    try {
        const notes = getNotes();
        res.status(200).json(notes);
    } catch (error) {
        console.error('Error retrieving notes:', error);
        res.status(500).send('An error occurred while retrieving notes');
    }
};

export const deleteNoteEP = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    if (!id) {
        return res.status(400).send('Note ID is required');
    }
    deleteNote(parseInt(id, 10));
    res.sendStatus(204);
    appEmitter.emit(DB_CHANGE_KEYS.notesChange);
};
