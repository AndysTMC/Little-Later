import { LLink, LLinkInsert, LNote, LVisualBM, LVisualBMInsert } from 'little-shared/types.js';
import { db } from '../db.js';
import { LINT_BOOLEAN, LLINK_TYPE } from 'little-shared/enums.js';
import { LDateUtl } from 'little-shared/utils/datetime.js';
import { createLink, deleteLink } from './link.js';
import { createNote, updateNote } from './note.js';
import { getUserSettings } from './settings.js';
export const putVisualBM = (
    visualBMInsert: LVisualBMInsert,
    noteCreates: LNote[],
    noteUpdates: LNote[],
    noteDeletes: LNote[],
    reminderDeleteIds: Array<number>,
    taskDeleteIds: Array<number>
): number => {
    let vbmId: number;

    const existingVBM = visualBMInsert.id ? getVisualBM(visualBMInsert.id) : null;

    if (existingVBM) {
        vbmId = visualBMInsert.id as number;
        const { id, ...updateData } = visualBMInsert;
        const params = {
            ...existingVBM,
            ...updateData,
            lastBrowseDate: LDateUtl.getNow(),
            hasBrowsed: LINT_BOOLEAN.TRUE,
        };
        const setClause = Object.keys(params)
            .filter((key) => key !== 'id')
            .map((key) => `${key} = @${key}`)
            .join(', ');
        if (setClause) {
            db.prepare(`UPDATE visualBMTbl SET ${setClause} WHERE id = @id`).run(params);
        }
    } else {
        const params = {
            ...visualBMInsert,
            customName: visualBMInsert.title,
            hasBrowsed: LINT_BOOLEAN.TRUE,
            lastBrowseDate: LDateUtl.getNow(),
            isSaved: LINT_BOOLEAN.FALSE,
        };
        const sql = `
            INSERT INTO visualBMTbl (url, title, customName, hasBrowsed, isSaved, lastBrowseDate)
            VALUES (@url, @title, @customName, @hasBrowsed, @isSaved, @lastBrowseDate)
        `;
        const info = db.prepare(sql).run(params);
        vbmId = Number(info.lastInsertRowid);
    }

    for (const note of noteCreates) {
        const noteId = createNote({ content: note.content });
        createLink({ noteId, type: LLINK_TYPE.NOTE_VBM, vbmId });
    }
    for (const note of noteUpdates) {
        updateNote(note.id, note);
    }
    for (const note of noteDeletes) {
        deleteLink({ noteId: note.id, type: LLINK_TYPE.NOTE_VBM, vbmId });
    }
    for (const reminderId of reminderDeleteIds) {
        deleteLink({ type: LLINK_TYPE.REMINDER_VBM, vbmId, reminderId });
    }
    for (const taskId of taskDeleteIds) {
        deleteLink({ type: LLINK_TYPE.TASK_VBM, vbmId, taskId });
    }
    return vbmId;
};

export const updateVisualBM = (url: string, modifications: Partial<LVisualBM>): number => {
    const visualBM = getVisualBMByUrl(url);

    if (!url) {
        throw new Error('URL is required');
    }

    if (visualBM === undefined) {
        if (!modifications.title) {
            throw new Error('Title is required for new VisualBM');
        }
        const urlObj = new URL(url);
        const userSettings = getUserSettings();

        const { totalVBMCount } = db
            .prepare('SELECT count(*) as totalVBMCount FROM visualBMTbl WHERE isSaved = ?')
            .get(LINT_BOOLEAN.FALSE) as { totalVBMCount: number };
        const { sameOriginVBMCount } = db
            .prepare(
                'SELECT count(*) as sameOriginVBMCount FROM visualBMTbl WHERE url LIKE ? AND isSaved = ?'
            )
            .get(`${urlObj.origin}%`, LINT_BOOLEAN.FALSE) as {
            sameOriginVBMCount: number;
        };

        if (totalVBMCount >= userSettings.misc.VBMLimit) {
            const limit = totalVBMCount - userSettings.misc.VBMLimit + 1;
            const idsToDelete = db
                .prepare(
                    `SELECT id FROM visualBMTbl WHERE isSaved = ? ORDER BY lastBrowseDate ASC LIMIT ?`
                )
                .all(LINT_BOOLEAN.FALSE, limit)
                .map((row: any) => row.id);
            if (idsToDelete.length > 0) {
                db.prepare(
                    `DELETE FROM visualBMTbl WHERE id IN (${idsToDelete.map(() => '?').join(',')})`
                ).run(...idsToDelete);
            }
        }

        if (sameOriginVBMCount >= userSettings.misc.VBMSameOriginLimit) {
            const limit = sameOriginVBMCount - userSettings.misc.VBMSameOriginLimit + 1;
            const idsToDelete = db
                .prepare(
                    `SELECT id FROM visualBMTbl WHERE isSaved = ? AND url LIKE ? ORDER BY lastBrowseDate ASC LIMIT ?`
                )
                .all(LINT_BOOLEAN.FALSE, `${urlObj.origin}%`, limit)
                .map((row: any) => row.id);
            if (idsToDelete.length > 0) {
                db.prepare(
                    `DELETE FROM visualBMTbl WHERE id IN (${idsToDelete.map(() => '?').join(',')})`
                ).run(...idsToDelete);
            }
        }

        const info = db
            .prepare(
                `INSERT INTO visualBMTbl (url, title, isSaved, hasBrowsed, lastBrowseDate) VALUES (?, ?, ?, ?, ?)`
            )
            .run(
                url,
                modifications.title,
                modifications.isSaved ?? LINT_BOOLEAN.FALSE,
                LINT_BOOLEAN.TRUE,
                LDateUtl.getNow()
            );

        return Number(info.lastInsertRowid);
    }

    const isSavedFinal = modifications.isSaved ?? visualBM.isSaved;
    const hasBrowsedFinal = modifications.hasBrowsed ?? visualBM.hasBrowsed;

    if (visualBM.isSaved === LINT_BOOLEAN.TRUE && modifications.isSaved === LINT_BOOLEAN.FALSE) {
        const vbmLinks = db
            .prepare('SELECT * FROM linkTbl WHERE vbmId = ?')
            .all(visualBM.id) as LLink[];
        for (const link of vbmLinks) {
            deleteLink(link as LLinkInsert);
        }
    }

    if (modifications.hasBrowsed === LINT_BOOLEAN.TRUE) {
        modifications.lastBrowseDate = LDateUtl.getNow();
    }

    if (hasBrowsedFinal === LINT_BOOLEAN.FALSE && isSavedFinal === LINT_BOOLEAN.FALSE) {
        db.prepare('DELETE FROM vbmPreviewTbl WHERE vbmId = ?').run(visualBM.id);
        db.prepare('DELETE FROM visualBMTbl WHERE id = ?').run(visualBM.id);
        return visualBM.id;
    }

    const { id: _, ...updateData } = modifications;
    if (Object.keys(updateData).length > 0) {
        const setClause = Object.keys(updateData)
            .map((key) => `${key} = @${key}`)
            .join(', ');
        const params = { ...updateData, id: visualBM.id };
        db.prepare(`UPDATE visualBMTbl SET ${setClause} WHERE id = @id`).run(params);
    }

    return visualBM.id;
};

export const getVisualBM = (id: number): LVisualBM | undefined => {
    const sql = `SELECT * FROM visualBMTbl WHERE id = ?`;
    return db.prepare(sql).get(id) as LVisualBM | undefined;
};

export const getVisualBMs = (): LVisualBM[] => {
    const sql = 'SELECT * FROM visualBMTbl';
    return db.prepare(sql).all() as LVisualBM[];
};

export const getVisualBMByUrl = (url: string): LVisualBM | undefined => {
    const sql = `SELECT * FROM visualBMTbl WHERE url = ?`;
    return db.prepare(sql).get(url) as LVisualBM | undefined;
};

export const updateVisualBMPreview = (vbmUrl: string, preview: Buffer): void => {
    const visualBM = getVisualBMByUrl(vbmUrl);
    if (!visualBM) {
        console.error(`VisualBM with url ${vbmUrl} not found.`);
        return;
    }
    const sql = `
        INSERT INTO vbmPreviewTbl (vbmId, blob)
        VALUES (@vbmId, @blob)
        ON CONFLICT(vbmId) DO UPDATE SET blob = excluded.blob;
    `;
    db.prepare(sql).run({
        vbmId: visualBM.id,
        blob: preview,
    });
};

export const getVisualBMPreview = (vbmId: number): Buffer | undefined => {
    const sql = `SELECT blob FROM vbmPreviewTbl WHERE vbmId = ?`;
    const row = db.prepare(sql).get(vbmId) as { blob: Buffer } | undefined;
    return row?.blob;
};
