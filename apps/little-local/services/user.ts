import {
    LEMPTY_PASSWORD,
    LEMPTY_VAULT_DATA_POST_DECRYPT,
    LINITIAL_USER_SETTINGS,
} from 'little-shared/constants.js';
import { encrypt, decrypt, uint8ArrayToBlob } from 'little-shared/utils/crypto.js';
import {
    LUserProfile,
    LVaultDataPostDecrypt,
    LVaultDataPostDecryptTables,
} from 'little-shared/types.js';
import { db } from '../db.js';
import { LINT_BOOLEAN, LTHEME } from 'little-shared/enums.js';
import { getUserSettings, resetUserSettings, updateUserSettings } from './settings.js';
import { LUserSettings } from 'little-shared/types.js';

export const authenticateUser = async (id: number, password?: string): Promise<boolean> => {
    const currentUserVault = db
        .prepare('SELECT data FROM userVaultTbl WHERE userId = ?')
        .get(id) as { data: Buffer } | undefined;
    if (!currentUserVault || !currentUserVault.data) {
        throw new Error('No user vault found');
    }
    try {
        const encryptedUint8Array = new Uint8Array(currentUserVault.data);
        const encryptedBlob = uint8ArrayToBlob(encryptedUint8Array);
        await decrypt<LVaultDataPostDecrypt>(password ?? LEMPTY_PASSWORD, encryptedBlob);
        return true;
    } catch {
        return false;
    }
};

export const createUser = async (name: string, avatar: Buffer | null): Promise<number> => {
    const vaultDataPostDecrypt: LVaultDataPostDecrypt = {
        tables: LEMPTY_VAULT_DATA_POST_DECRYPT.value,
        userSettings: LINITIAL_USER_SETTINGS.value,
    };
    const encryptedBlob = await encrypt(LEMPTY_PASSWORD, vaultDataPostDecrypt);
    const encryptedArrayBuffer = await encryptedBlob.arrayBuffer();
    const encryptedBuffer = Buffer.from(encryptedArrayBuffer);

    const profileInfo = db
        .prepare(
            'INSERT INTO userProfileTbl (name, theme, isCurrent) VALUES (@name, @theme, @isCurrent)'
        )
        .run({
            name,
            theme: LTHEME.LIGHT,
            isCurrent: LINT_BOOLEAN.FALSE,
        });
    const userId = Number(profileInfo.lastInsertRowid);

    db.prepare('INSERT INTO userAvatarTbl (userId, blob) VALUES (?, ?)').run(userId, avatar);

    // Create User Vault
    db.prepare('INSERT INTO userVaultTbl (userId, data) VALUES (?, ?)').run(
        userId,
        encryptedBuffer
    );

    updateUserSettings(LINITIAL_USER_SETTINGS.value);

    return userId;
};

export const deleteUser = (userId: number): void => {
    const userExists = db.prepare('SELECT 1 FROM userProfileTbl WHERE userId = ?').get(userId);
    if (!userExists) {
        throw new Error(`No user profile found for ID: ${userId}`);
    }

    db.prepare('DELETE FROM userAvatarTbl WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM userVaultTbl WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM userProfileTbl WHERE userId = ?').run(userId);

    const tablesToClear = [
        'linkTbl',
        'noteTbl',
        'reminderTbl',
        'taskTbl',
        'visualBMTbl',
        'vbmPreviewTbl',
    ];
    for (const table of tablesToClear) {
        db.prepare(`DELETE FROM ${table}`).run();
    }

    resetUserSettings();
};

export const getCurrentUserProfile = (): LUserProfile | undefined => {
    const sql = `SELECT * FROM userProfileTbl WHERE isCurrent = ?`;
    return db.prepare(sql).get(LINT_BOOLEAN.TRUE) as LUserProfile | undefined;
};

export const unlockUser = async (id: number, password?: string): Promise<void> => {
    const vaultRow = db.prepare('SELECT data FROM userVaultTbl WHERE userId = ?').get(id) as
        | { data: Buffer }
        | undefined;
    if (!vaultRow || !vaultRow.data) {
        throw new Error(`No user vault found for user ID: ${id}`);
    }
    const encryptedUint8Array = new Uint8Array(vaultRow.data);
    const encryptedBlob = uint8ArrayToBlob(encryptedUint8Array);
    const decryptedData = await decrypt<LVaultDataPostDecrypt>(
        password ?? LEMPTY_PASSWORD,
        encryptedBlob
    );

    // Using a transaction here is necessary for bulk insertion performance
    const bulkInsert = db.transaction(() => {
        const tablesInOrder = [
            'noteTbl',
            'reminderTbl',
            'taskTbl',
            'visualBMTbl',
            'vbmPreviewTbl',
            'linkTbl',
        ];

        for (const tableName of tablesInOrder) {
            const records = decryptedData.tables[tableName as keyof LVaultDataPostDecryptTables];
            if (!records || records.length === 0) continue;

            // This logic is equivalent to Dexie's bulkPut
            const columns = Object.keys(records[0]);
            const columnsString = columns.join(', ');
            const paramsString = columns.map((c) => `@${c}`).join(', ');
            const stmt = db.prepare(
                `INSERT INTO ${tableName} (${columnsString}) VALUES (${paramsString})`
            );

            for (const record of records) {
                // Manually handle JSON stringification for object fields
                const processedRecord: { [key: string]: any } = {};
                for (const key in record) {
                    const value = record[key as keyof typeof record];
                    if (typeof value === 'object' && value !== null) {
                        processedRecord[key] = JSON.stringify(value);
                    } else {
                        processedRecord[key] = value;
                    }
                }
                stmt.run(processedRecord);
            }
        }
    });

    bulkInsert();

    db.prepare(`UPDATE userProfileTbl SET isCurrent = ? WHERE userId = ?`).run(
        LINT_BOOLEAN.TRUE,
        id
    );

    updateUserSettings(decryptedData.userSettings);
};

export const lockUser = async (password: string | undefined): Promise<void> => {
    const currentUserProfile = getCurrentUserProfile();
    if (!currentUserProfile) {
        throw new Error('No current user profile found');
    }
    const userSettings: LUserSettings = getUserSettings();
    const tablesToVault = Object.keys(LEMPTY_VAULT_DATA_POST_DECRYPT.value);
    const vaultTablesData: Partial<LVaultDataPostDecryptTables> = {};

    for (const table of tablesToVault) {
        vaultTablesData[table as keyof LVaultDataPostDecryptTables] = db
            .prepare(`SELECT * FROM ${table}`)
            .all() as any;
    }

    const userVaultPostDecrypt: LVaultDataPostDecrypt = {
        tables: vaultTablesData as LVaultDataPostDecryptTables,
        userSettings: userSettings,
    };

    const encryptedBlob = await encrypt(password ?? LEMPTY_PASSWORD, userVaultPostDecrypt);
    const encryptedArrayBuffer = await encryptedBlob.arrayBuffer();
    const encryptedBuffer = Buffer.from(encryptedArrayBuffer);

    // Clear tables after successfully gathering data
    for (const table of tablesToVault) {
        db.prepare(`DELETE FROM ${table}`).run();
    }

    // Update vault
    db.prepare(`UPDATE userVaultTbl SET data = ? WHERE userId = ?`).run(
        encryptedBuffer,
        currentUserProfile.userId
    );

    // Update profile status
    db.prepare(`UPDATE userProfileTbl SET isCurrent = ? WHERE userId = ?`).run(
        LINT_BOOLEAN.FALSE,
        currentUserProfile.userId
    );

    resetUserSettings();
};

export const updateUserProfile = (userId: number, modifications: Partial<LUserProfile>): void => {
    if (modifications.isCurrent !== undefined) {
        throw new Error('isCurrent can only be modified through lockUser or unlockUser');
    }
    const { userId: _, isCurrent: __, ...updateData } = modifications;
    if (Object.keys(updateData).length === 0) {
        return;
    }
    const setClause = Object.keys(updateData)
        .map((key) => `${key} = @${key}`)
        .join(', ');
    const params = {
        ...updateData,
        userId,
    };
    const sql = `UPDATE userProfileTbl SET ${setClause} WHERE userId = @userId`;
    db.prepare(sql).run(params);
};

export const updateUserAvatar = (userId: number, avatar: Buffer | null): void => {
    // This 'upsert' logic matches Dexie's .update() behavior
    const sql = `
        INSERT INTO userAvatarTbl (userId, blob)
        VALUES (@userId, @blob)
        ON CONFLICT(userId) DO UPDATE SET blob = excluded.blob;
    `;

    db.prepare(sql).run({
        userId,
        blob: avatar ?? null,
    });
};

export const getUserAvatar = (userId: number): Buffer | null | undefined => {
    const sql = `SELECT blob FROM userAvatarTbl WHERE userId = ?`;
    const row = db.prepare(sql).get(userId) as { blob: Buffer | null } | undefined;
    return row?.blob;
};

export const getUserProfiles = (): LUserProfile[] => {
    const sql = `SELECT * FROM userProfileTbl`;
    return db.prepare(sql).all() as LUserProfile[];
};
