import { Request, Response } from 'express';
import {
    LLink,
    LNote,
    LReminder,
    LTask,
    LUserAvatar,
    LUserProfile,
    LUserSettings,
    LUserVault,
    LVisualBM,
} from 'little-shared/types';
import { db } from '../db';
import JSZip from 'jszip';
import { updateUserSettings } from '../services/settings';

type CurrentProfileSnapshot = {
    currentUserId: number;
    userSettings: LUserSettings;
    tables: {
        linkTbl: LLink[];
        noteTbl: LNote[];
        reminderTbl: LReminder[];
        taskTbl: LTask[];
        visualBMTbl: LVisualBM[];
        vbmPreviewIds: number[];
    };
};

const clearAllLocalTables = () => {
    const clearTables = db.transaction(() => {
        const tableNames = [
            'linkTbl',
            'noteTbl',
            'reminderTbl',
            'taskTbl',
            'vbmPreviewTbl',
            'visualBMTbl',
            'userAvatarTbl',
            'userVaultTbl',
            'userProfileTbl',
        ];
        for (const tableName of tableNames) {
            db.prepare(`DELETE FROM ${tableName}`).run();
        }
    });
    clearTables();
};

const importCurrentProfileSnapshot = async (
    snapshotBuffer: Buffer,
    userIdMap: Map<number, number>
) => {
    const zip = await JSZip.loadAsync(snapshotBuffer);
    const metadataText = await zip.file('metadata.json')?.async('text');
    if (!metadataText) {
        return;
    }
    const metadata = JSON.parse(metadataText) as CurrentProfileSnapshot;
    const previewBufferMap = new Map<number, Buffer>();
    for (const previewId of metadata.tables.vbmPreviewIds ?? []) {
        const previewFile = zip.file(`previews/${previewId}.bin`);
        if (!previewFile) continue;
        previewBufferMap.set(previewId, await previewFile.async('nodebuffer'));
    }

    const importTables = db.transaction(() => {
        const dataTableNames = [
            'linkTbl',
            'noteTbl',
            'reminderTbl',
            'taskTbl',
            'vbmPreviewTbl',
            'visualBMTbl',
        ];
        for (const tableName of dataTableNames) {
            db.prepare(`DELETE FROM ${tableName}`).run();
        }

        const insertNote = db.prepare(
            `INSERT INTO noteTbl (id, content, lastModificationDate) VALUES (@id, @content, @lastModificationDate)`
        );
        for (const note of metadata.tables.noteTbl ?? []) {
            insertNote.run(note);
        }

        const insertReminder = db.prepare(
            `INSERT INTO reminderTbl (id, message, targetDate, type, lastNotificationDate)
             VALUES (@id, @message, @targetDate, @type, @lastNotificationDate)`
        );
        for (const reminder of metadata.tables.reminderTbl ?? []) {
            insertReminder.run(reminder);
        }

        const insertTask = db.prepare(
            `INSERT INTO taskTbl (id, information, label, finishDate, priority, schedule)
             VALUES (@id, @information, @label, @finishDate, @priority, @schedule)`
        );
        for (const task of metadata.tables.taskTbl ?? []) {
            insertTask.run({
                ...task,
                schedule: JSON.stringify(task.schedule),
            });
        }

        const insertVBM = db.prepare(
            `INSERT INTO visualBMTbl (id, url, title, customName, hasBrowsed, isSaved, lastBrowseDate)
             VALUES (@id, @url, @title, @customName, @hasBrowsed, @isSaved, @lastBrowseDate)`
        );
        for (const visualBM of metadata.tables.visualBMTbl ?? []) {
            insertVBM.run({
                ...visualBM,
                customName: visualBM.customName ?? visualBM.title,
            });
        }

        const insertPreview = db.prepare(
            `INSERT INTO vbmPreviewTbl (vbmId, blob) VALUES (@vbmId, @blob)`
        );
        for (const [vbmId, blob] of previewBufferMap) {
            insertPreview.run({ vbmId, blob });
        }

        const insertLink = db.prepare(
            `INSERT INTO linkTbl (id, type, noteId, reminderId, taskId, vbmId)
             VALUES (@id, @type, @noteId, @reminderId, @taskId, @vbmId)`
        );
        for (const link of metadata.tables.linkTbl ?? []) {
            insertLink.run(link);
        }

        const mappedCurrentUserId = userIdMap.get(metadata.currentUserId);
        if (mappedCurrentUserId !== undefined) {
            db.prepare('UPDATE userProfileTbl SET isCurrent = 0').run();
            db.prepare('UPDATE userProfileTbl SET isCurrent = 1 WHERE userId = ?').run(
                mappedCurrentUserId
            );
        }
    });
    importTables();
    updateUserSettings(metadata.userSettings);
};

export const switchToLittleLocalEP = async (req: Request, res: Response) => {
    try {
        if (!req.body.userProfiles) {
            return res.status(400).json({ error: 'Missing userProfiles' });
        }

        const userProfiles: LUserProfile[] = JSON.parse(req.body.userProfiles);
        const files = req.files as Express.Multer.File[] | undefined;

        const avatarBufferMap = new Map<number, Buffer>();
        const vaultBufferMap = new Map<number, Buffer>();
        let currentSnapshotBuffer: Buffer | undefined;

        if (files && Array.isArray(files)) {
            for (const file of files) {
                const { fieldname, buffer } = file;
                let userId: number | null = null;

                if (fieldname.startsWith('vault_')) {
                    userId = parseInt(fieldname.slice(6), 10);
                    if (!isNaN(userId)) {
                        vaultBufferMap.set(userId, buffer);
                    }
                } else if (fieldname.startsWith('avatar_')) {
                    userId = parseInt(fieldname.slice(7), 10);
                    if (!isNaN(userId)) {
                        avatarBufferMap.set(userId, buffer);
                    }
                } else if (fieldname === 'currentSnapshot') {
                    currentSnapshotBuffer = buffer;
                }
            }
        }

        clearAllLocalTables();
        const userIdMap = new Map<number, number>();
        const insertUsers = db.transaction(() => {
            for (const profile of userProfiles) {
                const avatarBuffer = avatarBufferMap.get(profile.userId) || null;
                const vaultBuffer = vaultBufferMap.get(profile.userId) || null;
                const createProfileSql = `
                    INSERT INTO userProfileTbl (name, theme, isCurrent) VALUES (@name, @theme, 0)
                `;
                const profileInfo = db.prepare(createProfileSql).run({
                    name: profile.name,
                    theme: profile.theme,
                });
                const newUserId = Number(profileInfo.lastInsertRowid);
                userIdMap.set(profile.userId, newUserId);

                const createAvatarSql = `
                    INSERT INTO userAvatarTbl (userId, blob) VALUES (@userId, @blob)
                `;
                db.prepare(createAvatarSql).run({
                    userId: newUserId,
                    blob: avatarBuffer,
                });

                const createVaultSql = `
                    INSERT INTO userVaultTbl (userId, data) VALUES (@userId, @data)
                `;
                db.prepare(createVaultSql).run({
                    userId: newUserId,
                    data: vaultBuffer,
                });
            }
        });
        insertUsers();
        if (currentSnapshotBuffer) {
            await importCurrentProfileSnapshot(currentSnapshotBuffer, userIdMap);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error in switchToLittleLocalEP:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const switchToChromeEP = async (req: Request, res: Response) => {
    const userProfiles: LUserProfile[] = db
        .prepare('SELECT * FROM userProfileTbl')
        .all() as LUserProfile[];
    const userAvatars: LUserAvatar[] = db
        .prepare('SELECT * FROM userAvatarTbl')
        .all() as LUserAvatar[];
    const userVaults: LUserVault[] = db.prepare('SELECT * FROM userVaultTbl').all() as LUserVault[];
    const zip = new JSZip();

    zip.file('userProfiles.json', JSON.stringify(userProfiles, null, 2));

    // 🔧 Helper to normalize any blob/buffer-like object
    const toBuffer = async (data: any): Promise<Buffer> => {
        if (!data) return Buffer.alloc(0);
        if (data instanceof Buffer) return data;
        if (data instanceof Uint8Array) return Buffer.from(data);
        if (data instanceof Blob) return Buffer.from(await data.arrayBuffer());
        return Buffer.from(String(data));
    };

    for (const vault of userVaults) {
        if (!vault.data) continue;
        const data = await toBuffer(vault.data);
        zip.file(`vaults/vault_${vault.userId}.bin`, data);
    }

    for (const avatar of userAvatars) {
        if (!avatar.blob) continue;
        const data = await toBuffer(avatar.blob);
        zip.file(`avatars/avatar_${avatar.userId}.png`, data);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Disposition', 'attachment; filename=chromeExport.zip');
    res.setHeader('Content-Type', 'application/zip');
    res.send(zipBuffer);
};
