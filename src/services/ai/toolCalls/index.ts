import { createNoteToolCall } from "./createNote";
import { createReminderToolCall } from "./createReminder";
import { createTaskToolCall } from "./createTask";
import { deleteNoteToolCall } from "./deleteNote";
import { deleteReminderToolCall } from "./deleteReminder";
import { deleteSaveToolCall } from "./deleteSave";
import { deleteTaskToolCall } from "./deleteTask";
import { exportDataToolCall } from "./exportData";
import { formatDateTimeToolCall } from "./formatDateTime";
import { getCurrentDateTimeInfoToolCall } from "./getCurrentDateTimeInfo";
import { getProductivityOverviewToolCall } from "./getProductivityOverview";
import { getRecentHistoryToolCall } from "./getRecentHistory";
import { getSavePreviewImageToolCall } from "./getSavePreviewImage";
import { getUserAppThemePrefToolCall } from "./getUserAppThemePref";
import { getUserNameToolCall } from "./getUserName";
import { linkRecordsToolCall, unlinkRecordsToolCall } from "./linkRecords";
import { forgetFactToolCall, rememberFactToolCall } from "./memory";
import { readOpenTabsToolCall } from "./readOpenTabs";
import { saveActiveWebPageToolCall } from "./saveActiveWebPage";
import { searchAllToolCall } from "./searchAll";
import { searchImagesToolCall } from "./searchImages";
import { searchNotesToolCall } from "./searchNotes";
import { searchRemindersToolCall } from "./searchReminders";
import { searchSavesToolCall } from "./searchSaves";
import { searchTasksToolCall } from "./searchTasks";
import { setUserAppThemePrefToolCall } from "./setUserAppThemePref";
import { updateNoteToolCall } from "./updateNote";
import { updateReminderToolCall } from "./updateReminder";
import { updateSaveToolCall } from "./updateSave";
import { updateTaskToolCall } from "./updateTask";

export default {
	createNote: createNoteToolCall,
	createReminder: createReminderToolCall,
	createTask: createTaskToolCall,
	deleteNote: deleteNoteToolCall,
	deleteReminder: deleteReminderToolCall,
	deleteSave: deleteSaveToolCall,
	deleteTask: deleteTaskToolCall,
	exportData: exportDataToolCall,
	forgetFact: forgetFactToolCall,
	formatDateTime: formatDateTimeToolCall,
	getCurrentDataTimeInfo: getCurrentDateTimeInfoToolCall,
	getProductivityOverview: getProductivityOverviewToolCall,
	getRecentHistory: getRecentHistoryToolCall,
	getSavePreviewImage: getSavePreviewImageToolCall,
	getUserAppThemePref: getUserAppThemePrefToolCall,
	getUserName: getUserNameToolCall,
	linkRecords: linkRecordsToolCall,
	readOpenTabs: readOpenTabsToolCall,
	rememberFact: rememberFactToolCall,
	saveActiveWebPage: saveActiveWebPageToolCall,
	searchAll: searchAllToolCall,
	searchImages: searchImagesToolCall,
	searchNotes: searchNotesToolCall,
	searchReminders: searchRemindersToolCall,
	searchSaves: searchSavesToolCall,
	searchTasks: searchTasksToolCall,
	setUserAppThemePref: setUserAppThemePrefToolCall,
	unlinkRecords: unlinkRecordsToolCall,
	updateNote: updateNoteToolCall,
	updateReminder: updateReminderToolCall,
	updateSave: updateSaveToolCall,
	updateTask: updateTaskToolCall,
};
