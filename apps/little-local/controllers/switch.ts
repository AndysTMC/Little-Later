import { Request, Response } from 'express';
import { LUserProfile, LUserAvatar, LUserVault } from 'little-shared/types';
import { db } from '../db';
import JSZip from 'jszip';

export const switchToLittleLocalEP = async (req: Request, res: Response) => {
    try {
        if (!req.body.userProfiles) {
            return res.status(400).json({ error: 'Missing userProfiles' });
        }

        const userProfiles: LUserProfile[] = JSON.parse(req.body.userProfiles);
        const files = req.files as Express.Multer.File[] | undefined;

        const avatarBufferMap = new Map<number, Buffer>();
        const vaultBufferMap = new Map<number, Buffer>();

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
                }
            }
        }

        for (const profile of userProfiles) {
            const avatarBuffer = avatarBufferMap.get(profile.userId) || null;
            const vaultBuffer = vaultBufferMap.get(profile.userId) || null;

            const insertUser = db.transaction(() => {
                const createProfileSql = `
                    INSERT INTO userProfileTbl (name, theme, isCurrent) VALUES (@name, @theme, 0)
                `;
                const profileInfo = db.prepare(createProfileSql).run({
                    name: profile.name,
                    theme: profile.theme,
                });

                const newUserId = Number(profileInfo.lastInsertRowid);

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
            });

            insertUser();
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
    console.log(userProfiles, userAvatars, userVaults);
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
