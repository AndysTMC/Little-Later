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
import { exportDB } from "dexie-export-import";

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
	const currentProfile = await db.userProfileTbl
		.where("isCurrent")
		.equals(LINT_BOOLEAN.TRUE)
		.first();
	const currentUserId = currentProfile?.userId;
	const blob = await exportDB(db, {
		prettyJson: true,
		skipTables: ["userVaultTbl"],
		filter: (tableName, value) => {
			if (tableName === "userProfileTbl") {
				return (value as LUserProfile).isCurrent === LINT_BOOLEAN.TRUE;
			}
			if (tableName === "userAvatarTbl") {
				return (
					currentUserId !== undefined &&
					(value as LUserAvatar).userId === currentUserId
				);
			}
			return true;
		},
	});
	return blob;
};

const resetLLDB = async (): Promise<void> => {
	await db.delete();
	await db.open();
};

const getDBTables = async (tables: Array<keyof LDB>): Promise<LDB> => {
	const dbTables: LDB = LEMPTY_DB.value;
	for (const table of tables) {
		dbTables[table as keyof LDB] = await db.table(table).toArray();
	}
	return dbTables;
};

export { db, exportLLDB, resetLLDB, getDBTables };
