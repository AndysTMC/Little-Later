import { LEMPTY_VAULT_DATA_POST_DECRYPT, LEMPTY_PASSWORD } from 'little-shared/constants';
import { db } from '../db';
import { LINT_BOOLEAN } from 'little-shared/enums';
import {
    LVaultDataPostDecryptTables,
    LVaultDataPostDecrypt,
    LTask,
    LUserProfile,
} from 'little-shared/types';
import { encrypt } from 'little-shared/utils/crypto';
import { getUserSettings } from './settings';
import { getCurrentUserProfile, getUserAvatar } from './user';

export const exportDataImportable = async (): Promise<Buffer> => {
    const currentUserProfile = getCurrentUserProfile();
    if (!currentUserProfile) throw new Error('No current user profile found');
    const userSettings = getUserSettings();
    const userVaultPostDecrypt: LVaultDataPostDecrypt = {
        tables: LEMPTY_VAULT_DATA_POST_DECRYPT.value,
        userSettings: userSettings,
    };
    const tablesToExport = Object.keys(LEMPTY_VAULT_DATA_POST_DECRYPT.value);
    const vaultTablesData: Partial<LVaultDataPostDecryptTables> = {};
    for (const tableName of tablesToExport) {
        let records = db.prepare(`SELECT * FROM ${tableName}`).all() as any;
        if (tableName === 'taskTbl') {
            records = records.map((record: Omit<LTask, 'schedule'> & { schedule: string }) => ({
                ...record,
                schedule: JSON.parse(record.schedule),
            }));
        }
        vaultTablesData[tableName as keyof LVaultDataPostDecryptTables] = records as any;
    }
    const userVaultDataPostEncrypt = await encrypt<LVaultDataPostDecrypt>(
        LEMPTY_PASSWORD,
        userVaultPostDecrypt
    );
    const avatarBuffer = getUserAvatar(currentUserProfile.userId) ?? Buffer.alloc(0);
    currentUserProfile.isCurrent = LINT_BOOLEAN.FALSE;
    const profileJsonBlob = new Blob([JSON.stringify(currentUserProfile)], {
        type: 'application/json',
    });
    const profileJsonBuffer = await profileJsonBlob.arrayBuffer();
    const vaultBuffer = await userVaultDataPostEncrypt.arrayBuffer();
    const profileLength = new Uint32Array([profileJsonBuffer.byteLength]);
    const avatarLength = new Uint32Array([avatarBuffer.byteLength]);
    const vaultLength = new Uint32Array([vaultBuffer.byteLength]);
    const totalLength =
        4 + profileJsonBuffer.byteLength + 4 + avatarBuffer.byteLength + 4 + vaultBuffer.byteLength;
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    combined.set(new Uint8Array(profileLength.buffer), offset);
    offset += 4;
    combined.set(new Uint8Array(profileJsonBuffer), offset);
    offset += profileJsonBuffer.byteLength;
    combined.set(new Uint8Array(avatarLength.buffer), offset);
    offset += 4;
    combined.set(new Uint8Array(avatarBuffer), offset);
    offset += avatarBuffer.byteLength;
    combined.set(new Uint8Array(vaultLength.buffer), offset);
    offset += 4;
    combined.set(new Uint8Array(vaultBuffer), offset);
    offset += vaultBuffer.byteLength;
    return Buffer.from(combined.buffer, combined.byteOffset, totalLength);
};

export const exportDataReadable = async (): Promise<Buffer> => {
    const exportedDbData: Record<string, any[]> = {};
    const skipTables = new Set([
        'userVaultTbl',
        'userAvatarTbl',
        'vbmPreviewTbl',
        'sqlite_sequence',
    ]);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
    }[];

    for (const table of tables) {
        const tableName = table.name;
        if (skipTables.has(tableName)) continue;
        let records: any[];
        if (tableName === 'userProfileTbl') {
            records = db
                .prepare(`SELECT * FROM ${tableName} WHERE isCurrent = ?`)
                .all(LINT_BOOLEAN.TRUE);
        } else {
            records = db.prepare(`SELECT * FROM ${tableName}`).all();
        }
        if (tableName === 'taskTbl') {
            records = records.map((record: Omit<LTask, 'schedule'> & { schedule: string }) => ({
                ...record,
                schedule: JSON.parse(record.schedule),
            }));
        }
        exportedDbData[tableName] = records;
    }

    const exportable = {
        db: exportedDbData,
        userSettings: getUserSettings(),
    };

    const jsonString = JSON.stringify(exportable, null, 2);
    const jsonBlob = new Blob([jsonString], {
        type: 'application/json',
    });
    const jsonArrayBuffer = await jsonBlob.arrayBuffer();
    const jsonBuffer = Buffer.from(jsonArrayBuffer);
    return jsonBuffer;
};
export const importData = async (buffer: ArrayBuffer): Promise<void> => {
    const view = new DataView(buffer);
    let offset = 0;
    if (offset + 4 > buffer.byteLength) {
        throw new Error('Invalid import file: too short for profile length');
    }
    const profileLength = view.getUint32(offset, true);
    offset += 4;
    if (offset + profileLength > buffer.byteLength) {
        throw new Error('Invalid profile length');
    }
    const profileBytes = new Uint8Array(buffer, offset, profileLength);
    offset += profileLength;
    if (offset + 4 > buffer.byteLength) {
        throw new Error('Invalid import file: too short for avatar length');
    }
    const avatarLength = view.getUint32(offset, true);
    offset += 4;
    if (offset + avatarLength > buffer.byteLength) {
        throw new Error('Invalid avatar length');
    }
    const avatarBytes = new Uint8Array(buffer, offset, avatarLength);
    // const avatarBlob = new Blob([avatarBytes]);
    offset += avatarLength;
    if (offset + 4 > buffer.byteLength) {
        throw new Error('Invalid import file: too short for vault length');
    }
    const vaultLength = view.getUint32(offset, true);
    offset += 4;
    if (offset + vaultLength > buffer.byteLength) {
        throw new Error('Invalid vault length');
    }
    const vaultBytes = new Uint8Array(buffer, offset, vaultLength);
    // const userVaultDataPostEncrypt = new Blob([vaultBytes], {
    // 	type: "application/octet-stream",
    // });
    offset += vaultLength;
    if (offset !== buffer.byteLength) {
        throw new Error('Extra data in the import file');
    }
    let profileJson;
    try {
        profileJson = JSON.parse(new TextDecoder().decode(profileBytes));
    } catch {
        throw new Error('Failed to parse user profile JSON');
    }
    if (!profileJson.userId) {
        throw new Error('Invalid user profile: missing userId');
    }
    const currentUserProfile: LUserProfile = profileJson;

    const importTransaction = db.transaction(() => {
        const profileColumns = Object.keys(currentUserProfile);
        const profileUpdateSet = profileColumns
            .filter((c) => c !== 'userId')
            .map((c) => `${c} = excluded.${c}`)
            .join(', ');
        const profileSql = `
			INSERT INTO userProfileTbl (${profileColumns.join(', ')})
			VALUES (${profileColumns.map((c) => `@${c}`).join(', ')})
			ON CONFLICT(userId) DO UPDATE SET ${profileUpdateSet};
		`;
        db.prepare(profileSql).run(currentUserProfile);

        const avatarSql = `
			INSERT INTO userAvatarTbl (userId, blob)
			VALUES (@userId, @blob)
			ON CONFLICT(userId) DO UPDATE SET blob = excluded.blob;
		`;
        db.prepare(avatarSql).run({
            userId: currentUserProfile.userId,
            blob: avatarBytes,
        });

        const vaultSql = `
			INSERT INTO userVaultTbl (userId, data)
			VALUES (@userId, @data)
			ON CONFLICT(userId) DO UPDATE SET data = excluded.data;
   		`;
        db.prepare(vaultSql).run({
            userId: currentUserProfile.userId,
            data: vaultBytes,
        });
    });

    importTransaction();
};
