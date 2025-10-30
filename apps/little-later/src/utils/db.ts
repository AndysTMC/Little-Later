import { LINT_BOOLEAN } from "little-shared/enums";
import { LDB } from "little-shared/types";
import { LEMPTY_DB } from "little-shared/constants";

import {
	LLink,
	LLinkInsert,
	LNote,
	LNoteInsert,
	LReminder,
	LReminderInsert,
	LTask,
	LTaskInsert,
	LUserAvatar,
	LUserProfile,
	LUserProfileInsert,
	LUserVault,
	LVBMPreview,
	LVBMPreviewInsert,
	LVisualBM,
	LVisualBMInsert,
} from "little-shared/types";
import Dexie, { EntityTable } from "dexie";
import { exportDB, importInto } from "dexie-export-import";

const db = new Dexie("LLDB") as Dexie & {
	linkTbl: EntityTable<LLink, "id", LLinkInsert>;
	noteTbl: EntityTable<LNote, "id", LNoteInsert>;
	reminderTbl: EntityTable<LReminder, "id", LReminderInsert>;
	taskTbl: EntityTable<LTask, "id", LTaskInsert>;
	userAvatarTbl: EntityTable<LUserAvatar, "userId">;
	userProfileTbl: EntityTable<LUserProfile, "userId", LUserProfileInsert>;
	userVaultTbl: EntityTable<LUserVault, "userId">;
	vbmPreviewTbl: EntityTable<LVBMPreview, "vbmId", LVBMPreviewInsert>;
	visualBMTbl: EntityTable<LVisualBM, "id", LVisualBMInsert>;
};

db.version(1).stores({
	linkTbl:
		"++id, reminderId, taskId, vbmId, noteId, [type+taskId], [type+reminderId+taskId], [type+reminderId+vbmId], [type+noteId+vbmId], [type+taskId+vbmId]",
	noteTbl: "++id",
	reminderTbl: "++id, type",
	taskTbl: "++id, information, finishDate, label",
	userAvatarTbl: "userId",
	userProfileTbl: "++userId, isCurrent",
	userVaultTbl: "userId",
	vbmPreviewTbl: "vbmId",
	visualBMTbl: "++id, hasBrowsed, isSaved, &url, lastBrowseDate",
});

const exportLLDB = async () => {
	const blob = await exportDB(db, {
		prettyJson: true,
		skipTables: ["userVaultTbl", "imageTbl"],
		filter: (tableName, value) => {
			if (tableName === "userProfileTbl") {
				return (value as LUserProfile).isCurrent === LINT_BOOLEAN.TRUE;
			}
			return true;
		},
	});
	return blob;
};

const importLLDB = async (blob: Blob): Promise<void> => {
	await importInto(db, blob, {
		overwriteValues: true,
	});
};

const resetLLDB = async (): Promise<void> => {
	await db.delete();
	await db.open();
};

const getDBTables = async (tables: Array<keyof LDB>): Promise<LDB> => {
	const dbTables: LDB = LEMPTY_DB.value;
	for (const table of tables) {
		dbTables[table as keyof LDB] = await db.table(table).toArray();
		table.toString();
	}
	return dbTables;
};

export { db, exportLLDB, importLLDB, resetLLDB, getDBTables };
