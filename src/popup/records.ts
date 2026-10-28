import type { Note, Reminder, Save, Task } from "../storage/repositories";
import type { LinkRow } from "../storage/schema";
import type { Settings } from "../storage/repositories";
import type { UserProfile } from "./hooks/useUserProfiles";

// What the home page loads once and hands to its views.
export type HomeData = {
	currentUserProfile: UserProfile;
	userSettings: Settings;
	links: Array<LinkRow>;
	notes: Array<Note>;
	reminders: Array<Reminder>;
	tasks: Array<Task>;
	// Every page: saved ones and browsing history.
	pages: Array<Save>;
};

// Records among `candidates` that link to `targetId`, such as the tasks
// attached to a save.
export const linkedTo = <T extends { id: string }>(
	links: ReadonlyArray<LinkRow>,
	targetId: string,
	candidates: ReadonlyArray<T>,
): Array<T> => {
	const byId = new Map(candidates.map((record) => [record.id, record]));
	return links
		.filter((link) => link.toId === targetId && byId.has(link.fromId))
		.map((link) => byId.get(link.fromId)!);
};

// Records among `candidates` that `sourceId` links to, such as the save a
// task is attached to.
export const linkedFrom = <T extends { id: string }>(
	links: ReadonlyArray<LinkRow>,
	sourceId: string,
	candidates: ReadonlyArray<T>,
): Array<T> => {
	const byId = new Map(candidates.map((record) => [record.id, record]));
	return links
		.filter((link) => link.fromId === sourceId && byId.has(link.toId))
		.map((link) => byId.get(link.toId)!);
};

const includes = (text: string, word: string) =>
	text.toLowerCase().includes(word.toLowerCase());

export const searchSaves = (saves: ReadonlyArray<Save>, word: string) =>
	saves.filter(
		(save) =>
			save.saved &&
			includes(save.customName + save.url + save.title, word),
	);

export const searchNotes = (notes: ReadonlyArray<Note>, word: string) =>
	notes.filter((note) => includes(note.content, word));

export const searchTasks = (tasks: ReadonlyArray<Task>, word: string) =>
	tasks.filter(
		(task) =>
			includes(task.information, word) || includes(task.label, word),
	);

export const searchReminders = (
	reminders: ReadonlyArray<Reminder>,
	word: string,
) => reminders.filter((reminder) => includes(reminder.message, word));

// Done one-off tasks are finished; a recurring task stays open and moves
// on when completed. An open task past its deadline is missed.
export type TaskStatus = "missed" | "active" | "finished";
export const taskStatus = (task: Task, now: number = Date.now()): TaskStatus =>
	task.done
		? "finished"
		: task.dueAt !== 0 && task.dueAt < now
			? "missed"
			: "active";

export const reminderKind = (reminder: Reminder): "normal" | "escalating" =>
	reminder.escalation ? "escalating" : "normal";
