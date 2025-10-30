import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'LLDB.db');
const db: Database.Database = new Database(dbPath, {
    // Set to console.log for debugging database queries if needed
    verbose: console.log,
});

/**
 * Initializes the database by creating tables and indexes.
 * This schema is an exact structural match to the Dexie database.
 * Foreign key constraints have been removed to mirror Dexie's behavior,
 * ensuring feature parity and simplifying application logic across both platforms.
 */
export const initializeDatabase = () => {
    const ddl = `
        -- User Profile and related tables
        CREATE TABLE IF NOT EXISTS userProfileTbl (
            userId INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            theme TEXT,
            isCurrent INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_userProfile_isCurrent ON userProfileTbl(isCurrent);

        CREATE TABLE IF NOT EXISTS userAvatarTbl (
            userId INTEGER PRIMARY KEY,
            blob BLOB
        );

        CREATE TABLE IF NOT EXISTS userVaultTbl (
            userId INTEGER PRIMARY KEY,
            data BLOB NOT NULL
        );

        -- Core data tables
        CREATE TABLE IF NOT EXISTS visualBMTbl (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            customName TEXT,
            hasBrowsed INTEGER,
            isSaved INTEGER,
            lastBrowseDate TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_visualBM_hasBrowsed ON visualBMTbl(hasBrowsed);
        CREATE INDEX IF NOT EXISTS idx_visualBM_isSaved ON visualBMTbl(isSaved);

        CREATE TABLE IF NOT EXISTS vbmPreviewTbl (
            vbmId INTEGER PRIMARY KEY,
            blob BLOB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS noteTbl (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            lastModificationDate TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS taskTbl (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            information TEXT(256) NOT NULL,
            label TEXT(20) NOT NULL,
            finishDate TEXT,
            priority TEXT NOT NULL,
            schedule TEXT NOT NULL -- Stored as JSON string
        );
        CREATE INDEX IF NOT EXISTS idx_task_information ON taskTbl(information);
        CREATE INDEX IF NOT EXISTS idx_task_finishDate ON taskTbl(finishDate);
        CREATE INDEX IF NOT EXISTS idx_task_label ON taskTbl(label);
        
        CREATE TABLE IF NOT EXISTS reminderTbl (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT(256) NOT NULL,
            targetDate TEXT NOT NULL,
            type TEXT NOT NULL,
            lastNotificationDate TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reminder_type ON reminderTbl(type);

        -- Linking table for relationships
        CREATE TABLE IF NOT EXISTS linkTbl (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            noteId INTEGER,
            reminderId INTEGER,
            taskId INTEGER,
            vbmId INTEGER
        );
        -- Indexes ported directly from the Dexie schema
        CREATE INDEX IF NOT EXISTS idx_link_reminderId ON linkTbl(reminderId);
        CREATE INDEX IF NOT EXISTS idx_link_taskId ON linkTbl(taskId);
        CREATE INDEX IF NOT EXISTS idx_link_vbmId ON linkTbl(vbmId);
        CREATE INDEX IF NOT EXISTS idx_link_noteId ON linkTbl(noteId);
        -- Compound Indexes ported directly from the Dexie schema
        CREATE INDEX IF NOT EXISTS idx_link_type_taskId ON linkTbl(type, taskId);
        CREATE INDEX IF NOT EXISTS idx_link_type_reminderId_taskId ON linkTbl(type, reminderId, taskId);
        CREATE INDEX IF NOT EXISTS idx_link_type_reminderId_vbmId ON linkTbl(type, reminderId, vbmId);
        CREATE INDEX IF NOT EXISTS idx_link_type_noteId_vbmId ON linkTbl(type, noteId, vbmId);
        CREATE INDEX IF NOT EXISTS idx_link_type_taskId_vbmId ON linkTbl(type, taskId, vbmId);
    `;

    db.exec(ddl);
};

export { db };
