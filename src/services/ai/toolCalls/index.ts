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
import { saveActiveWebPageToolCall } from "./saveActiveWebPage";
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
	formatDateTime: formatDateTimeToolCall,
	getCurrentDataTimeInfo: getCurrentDateTimeInfoToolCall,
	getProductivityOverview: getProductivityOverviewToolCall,
	getRecentHistory: getRecentHistoryToolCall,
	getSavePreviewImage: getSavePreviewImageToolCall,
	getUserAppThemePref: getUserAppThemePrefToolCall,
	getUserName: getUserNameToolCall,
	saveActiveWebPage: saveActiveWebPageToolCall,
	searchNotes: searchNotesToolCall,
	searchReminders: searchRemindersToolCall,
	searchSaves: searchSavesToolCall,
	searchTasks: searchTasksToolCall,
	setUserAppThemePref: setUserAppThemePrefToolCall,
	updateNote: updateNoteToolCall,
	updateReminder: updateReminderToolCall,
	updateSave: updateSaveToolCall,
	updateTask: updateTaskToolCall,
};
