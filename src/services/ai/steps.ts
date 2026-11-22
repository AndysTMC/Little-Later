// What a tool call looks like in LittleAI's activity (decision 0017): what
// it is doing while it runs, and what it did once done.

const STEPS: Record<string, { doing: string; done: string }> = {
	search_notes: { doing: "Searching your notes", done: "Searched notes" },
	search_tasks: { doing: "Searching your tasks", done: "Searched tasks" },
	search_reminders: {
		doing: "Searching your reminders",
		done: "Searched reminders",
	},
	search_saves: { doing: "Searching your saves", done: "Searched saves" },
	get_recent_history: {
		doing: "Reading your history",
		done: "Read recent history",
	},
	get_productivity_overview: {
		doing: "Looking over your week",
		done: "Got an overview",
	},
	get_save_preview_image: {
		doing: "Getting a page preview",
		done: "Got a page preview",
	},
	get_user_name: { doing: "Checking your name", done: "Checked your name" },
	get_user_app_theme_pref: {
		doing: "Checking the theme",
		done: "Checked the theme",
	},
	get_current_date_time_info: {
		doing: "Checking the date",
		done: "Checked the date",
	},
	format_date_time: {
		doing: "Working out a date",
		done: "Worked out a date",
	},
	save_active_web_page: {
		doing: "Preparing to save page",
		done: "Prepared to save page",
	},
	create_note: { doing: "Writing a note", done: "Prepared a note" },
	create_task: { doing: "Writing a task", done: "Prepared a task" },
	create_reminder: {
		doing: "Setting a reminder",
		done: "Prepared a reminder",
	},
	update_note: { doing: "Editing a note", done: "Prepared a note edit" },
	update_task: { doing: "Editing a task", done: "Prepared a task edit" },
	update_reminder: {
		doing: "Editing a reminder",
		done: "Prepared a reminder edit",
	},
	update_save: { doing: "Renaming a save", done: "Prepared a rename" },
	delete_note: { doing: "Finding the note", done: "Prepared a deletion" },
	delete_task: { doing: "Finding the task", done: "Prepared a deletion" },
	delete_reminder: {
		doing: "Finding the reminder",
		done: "Prepared a deletion",
	},
	delete_save: { doing: "Finding the save", done: "Prepared a removal" },
	export_data: { doing: "Preparing an export", done: "Prepared an export" },
	set_user_app_theme_pref: {
		doing: "Changing the theme",
		done: "Prepared a theme change",
	},
	ask_user: { doing: "Writing a question", done: "Asked you" },
	// Not a tool the model calls: the page the user attached.
	read_page: { doing: "Reading the page", done: "Read the page" },
	read_page_part: {
		doing: "Reading the page",
		done: "Read part of the page: it was too long",
	},
};

const humanise = (name: string) => {
	const words = name.replace(/_/g, " ").trim();
	return words.charAt(0).toUpperCase() + words.slice(1);
};

export const stepDoing = (tool: string): string =>
	STEPS[tool]?.doing ?? `Using ${humanise(tool).toLowerCase()}`;

export const stepDone = (tool: string): string =>
	STEPS[tool]?.done ?? `Used ${humanise(tool).toLowerCase()}`;
