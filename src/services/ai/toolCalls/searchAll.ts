import type {
	ImageRecord,
	Note,
	Reminder,
	Save,
	Task,
} from "../../../storage/repositories";
import {
	readImages,
	readNotes,
	readReminders,
	readSaves,
	readTasks,
} from "../records";
import { hybridRank } from "./_utils/bm25";
import { normalizeTag } from "../../../utils/tags";
import type { AIOwner } from "../owner";

export type FederatedSearchResult = {
	notes: Array<Note>;
	tasks: Array<Task>;
	reminders: Array<Reminder>;
	saves: Array<Save>;
	images: Array<ImageRecord>;
};

const matchesTag = (tags: Array<string> | undefined, tag?: string): boolean => {
	if (!tag || tag.trim() === "") return true;
	const target = normalizeTag(tag);
	if (!target) return true;
	return (tags ?? []).some((item) => item.toLowerCase() === target);
};

const rankOrSlice = <T>(
	items: Array<T>,
	query: string,
	getText: (item: T) => string,
	limit: number,
): Array<T> => {
	if (query.trim() === "") {
		return items.slice(0, limit);
	}
	return hybridRank(items, query, getText)
		.slice(0, limit)
		.map((entry) => entry.item);
};

const toolCall = async (
	owner: AIOwner,
	{
		query = "",
		tag,
		limit = 5,
	}: {
		query?: string;
		tag?: string;
		limit?: number;
	},
): Promise<FederatedSearchResult> => {
	const safeLimit = Math.max(1, Math.min(15, Math.trunc(limit)));
	const keys = await owner.keys();
	const [allNotes, allTasks, allReminders, allSaves, allImages] =
		await Promise.all([
			readNotes(keys),
			readTasks(keys),
			readReminders(keys),
			readSaves(keys),
			readImages(keys),
		]);

	const notesPool = allNotes.filter((note) => matchesTag(note.tags, tag));
	const tasksPool = allTasks.filter((task) => matchesTag(task.tags, tag));
	const remindersPool = allReminders.filter((reminder) =>
		matchesTag(reminder.tags, tag),
	);
	const savesPool = allSaves.filter(
		(save) => save.saved && matchesTag(save.tags, tag),
	);
	const imagesPool = allImages.filter((image) => matchesTag(image.tags, tag));

	return {
		notes: rankOrSlice(
			notesPool,
			query,
			(note) =>
				[note.title ?? "", note.content, ...(note.tags ?? [])].join(
					" ",
				),
			safeLimit,
		),
		tasks: rankOrSlice(
			tasksPool,
			query,
			(task) =>
				[task.label, task.information, ...(task.tags ?? [])].join(" "),
			safeLimit,
		),
		reminders: rankOrSlice(
			remindersPool,
			query,
			(reminder) =>
				[reminder.message, ...(reminder.tags ?? [])].join(" "),
			safeLimit,
		),
		saves: rankOrSlice(
			savesPool,
			query,
			(save) =>
				[
					save.customName,
					save.title,
					save.url,
					...(save.tags ?? []),
					save.snapshot?.slice(0, 2_000) ?? "",
				].join(" "),
			safeLimit,
		),
		images: rankOrSlice(
			imagesPool,
			query,
			(image) =>
				[
					image.title,
					image.sourceUrl ?? "",
					...(image.tags ?? []),
				].join(" "),
			safeLimit,
		),
	};
};

export { toolCall as searchAllToolCall };
