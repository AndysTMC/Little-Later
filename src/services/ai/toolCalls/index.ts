import { createNoteToolCall } from "./createNote";
import { createReminderToolCall } from "./createReminder";
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
import { searchNotesToolCall } from "./searchNotes";
import { searchRemindersToolCall } from "./searchReminders";
import { searchSavesToolCall } from "./searchSaves";
import { searchTasksToolCall } from "./searchTasks";
import { setUserAppThemePrefToolCall } from "./setUserAppThemePref";
import { updateNoteToolCall } from "./updateNote";
import { updateReminderToolCall } from "./updateReminder";

export default {
	createNote: createNoteToolCall,
	createReminder: createReminderToolCall,
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
	searchNotes: searchNotesToolCall,
	searchReminders: searchRemindersToolCall,
	searchSaves: searchSavesToolCall,
	searchTasks: searchTasksToolCall,
	setUserAppThemePref: setUserAppThemePrefToolCall,
	updateNote: updateNoteToolCall,
	updateReminder: updateReminderToolCall,
};
