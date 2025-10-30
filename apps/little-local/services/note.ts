import { db } from '../db.js';
import { LLink, LNote, LNoteInsert } from 'little-shared/types.js';
import { LDateUtl } from 'little-shared/utils/datetime.js';
import { deleteLink } from './link.js';

export const getNote = (id: number): LNote | undefined => {
    return db.prepare('SELECT * FROM noteTbl WHERE id = ?').get(id) as LNote | undefined;
};

export const getNotes = (): LNote[] => {
    const sql = 'SELECT * FROM noteTbl';
    const rows = db.prepare(sql).all() as LNote[];
    return rows;
};

export const createNote = (note: LNoteInsert): number => {
    const sql = `
    INSERT INTO noteTbl (content, lastModificationDate)
    VALUES (@content, @lastModificationDate)
  `;
    const stmt = db.prepare(sql);
    const info = stmt.run({
        content: note.content,
        lastModificationDate: LDateUtl.getNow(),
    });
    return Number(info.lastInsertRowid);
};

export const updateNote = (id: number, modifications: Partial<LNote>): void => {
    const { id: _, ...updateData } = modifications;
    const fieldsToUpdate = Object.keys(updateData);
    if (fieldsToUpdate.length === 0) {
        return;
    }
    const params = {
        ...updateData,
        lastModificationDate: LDateUtl.getNow(),
        id,
    };
    const setClause = Object.keys(params)
        .filter((key) => key !== 'id')
        .map((key) => `${key} = @${key}`)
        .join(', ');
    const sql = `UPDATE noteTbl SET ${setClause} WHERE id = @id`;
    db.prepare(sql).run(params);
};

export const deleteNote = (id: number): void => {
    const noteExists = getNote(id);
    if (!noteExists) {
        throw new Error(`Note with id ${id} not found`);
    }

    const noteLinks = db.prepare('SELECT * FROM linkTbl WHERE noteId = ?').all(id) as LLink[];

    for (const link of noteLinks) {
        deleteLink(link);
    }

    db.prepare('DELETE FROM noteTbl WHERE id = ?').run(id);
};
