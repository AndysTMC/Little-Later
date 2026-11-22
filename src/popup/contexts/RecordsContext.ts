import { createContext } from "react";
import type {
	ImageRecord,
	Note,
	Reminder,
	Save,
	Task,
} from "../../storage/repositories";
import type { LinkRow } from "../../storage/schema";

// The unlocked profile's records, read once for every page. Each list is
// undefined until it has been read, and again once the profile locks.
export type Records = {
	saves: Array<Save> | undefined;
	notes: Array<Note> | undefined;
	images: Array<ImageRecord> | undefined;
	tasks: Array<Task> | undefined;
	reminders: Array<Reminder> | undefined;
	links: Array<LinkRow> | undefined;
};

export const RecordsContext = createContext<Records>({
	saves: undefined,
	notes: undefined,
	images: undefined,
	tasks: undefined,
	reminders: undefined,
	links: undefined,
});
