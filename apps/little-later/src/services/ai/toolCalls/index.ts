import { createNoteToolCall } from "./createNote";
import { createNoteOnActiveWebpageToolCall } from "./createNoteOnActiveWebpage";
import { createReminderToolCall } from "./createReminder";
import { createTaskToolCall } from "./createTask";
import { deleteNoteToolCall } from "./deleteNote";
import { deleteReminderToolCall } from "./deleteReminder";
import { deleteSaveToolCall } from "./deleteSave";
import { deleteTaskToolCall } from "./deleteTask";
import { exportDataToolCall } from "./exportData";
import { getCurrentDateTimeInfoToolCall } from "./getCurrentDateTimeInfo";
import { getUserAppThemePrefToolCall } from "./getUserAppThemePref";
import { getUserNameToolCall } from "./getUserName";
import { linkNoteToActiveWebpageToolCall } from "./linkNoteToActiveWebpage";
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
	createNoteOnActiveWebpage: createNoteOnActiveWebpageToolCall,
	createReminder: createReminderToolCall,
	createTask: createTaskToolCall,
	deleteNote: deleteNoteToolCall,
	deleteReminder: deleteReminderToolCall,
	deleteSave: deleteSaveToolCall,
	deleteTask: deleteTaskToolCall,
	exportData: exportDataToolCall,
	getCurrentDataTimeInfo: getCurrentDateTimeInfoToolCall,
	getUserAppThemePref: getUserAppThemePrefToolCall,
	getUserName: getUserNameToolCall,
	linkNoteToActiveWebpage: linkNoteToActiveWebpageToolCall,
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
