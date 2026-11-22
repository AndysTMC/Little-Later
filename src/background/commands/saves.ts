import Dexie from "dexie";
import { originKeyFor, urlKeyFor } from "little-shared/utils/envelope";
import { sealBody, type ProfileKeys } from "../../storage/keys";
import {
	getSettings,
	openSave,
	type SaveContent,
} from "../../storage/repositories";
import type { LittleDB, SaveRow } from "../../storage/schema";
import { cascadeTables, removeRecords } from "./cascade";
import { optionalTags } from "./records";
import {
	CommandError,
	asRecord,
	asString,
	defineCommand,
	fail,
	type CommandContext,
} from "./registry";

const MAX_TITLE_LENGTH = 1_000;

export const asWebUrl = (value: unknown): string => {
	const url = asString(value, "url");
	try {
		const { protocol } = new URL(url);
		if (protocol === "http:" || protocol === "https:") {
			return url;
		}
	} catch {
		// Falls through to the refusal below.
	}
	return fail("url must be an http or https address.");
};

// The page's title, or undefined when it has none yet (it is still loading,
// or it is an error page).
const asTitle = (value: unknown): string | undefined => {
	if (value === undefined) return undefined;
	const title = asString(value, "title").trim().slice(0, MAX_TITLE_LENGTH);
	return title !== "" ? title : undefined;
};

const optionalBoolean = (value: unknown, field: string) =>
	value === undefined || typeof value === "boolean"
		? (value as boolean | undefined)
		: fail(`${field} must be a boolean.`);

const getOwnSave = async (
	db: LittleDB,
	keys: ProfileKeys,
	id: string,
): Promise<SaveRow> => {
	const row = await db.saves.get(id);
	if (!row || row.profileId !== keys.profileId) {
		throw new CommandError("rejected", "Save not found.");
	}
	return row;
};

// Unsaved pages to drop so that adding one more stays within the history
// limit and the per-site limit; oldest visit first.
const pagesToEvict = async (
	ctx: CommandContext,
	keys: ProfileKeys,
	originKey: string,
): Promise<Array<string>> => {
	const { misc } = await getSettings(ctx.db, keys);
	const unsaved = (await ctx.db.saves
		.where("[profileId+saved+browsedAt]")
		.between(
			[keys.profileId, 0, Dexie.minKey],
			[keys.profileId, 0, Dexie.maxKey],
		)
		.primaryKeys()) as Array<string>;
	const evict = new Set(
		unsaved.slice(0, Math.max(0, unsaved.length - misc.VBMLimit + 1)),
	);
	const sameSite = (
		await ctx.db.saves
			.where("[profileId+originKey]")
			.equals([keys.profileId, originKey])
			.filter((row) => row.saved === 0)
			.toArray()
	).sort((a, b) => a.browsedAt - b.browsedAt);
	sameSite
		.slice(0, Math.max(0, sameSite.length - misc.VBMSameOriginLimit + 1))
		.forEach((row) => evict.add(row.id));
	return [...evict];
};

// A visit to a page, or saving it. Creates the record once per URL; later
// calls mark it browsed now, refresh its title, and can mark it saved.
export const saveCapture = defineCommand({
	name: "save.capture",
	parse: (input) => {
		const record = asRecord(input);
		const url = asWebUrl(record.url);
		return {
			url,
			title: asTitle(record.title),
			saved: optionalBoolean(record.saved, "saved"),
		};
	},
	run: async (ctx, input) => {
		// Without a title yet, the host name stands in for one.
		const untitled = input.title === undefined;
		const title = input.title ?? new URL(input.url).hostname;
		const keys = await ctx.keys();
		const urlKey = await urlKeyFor(keys.index, input.url);
		const now = ctx.now();
		const existing = await ctx.db.saves
			.where("[profileId+urlKey]")
			.equals([keys.profileId, urlKey])
			.first();

		if (existing) {
			const content = await openSave(keys, existing);
			const existingTags = content.tags ?? [];
			const preservedMeta = {
				...(content.archived ? { archived: true } : {}),
				...(existingTags.length > 0 ? { tags: existingTags } : {}),
			};
			const sealed = await sealBody<SaveContent>(
				keys,
				"saves",
				existing.id,
				// A page first seen before its title loaded (an error page,
				// a slow site) was named after its host as a stand-in. The
				// first real title replaces it; any other name, the first
				// real title or one the user chose, is kept.
				content.provisional && !untitled
					? {
							url: content.url,
							title,
							customName: title,
							...preservedMeta,
						}
					: {
							url: content.url,
							title,
							customName: content.customName,
							...(content.provisional
								? { provisional: true as const }
								: {}),
							...preservedMeta,
						},
			);
			await ctx.db.saves.put({
				...existing,
				...sealed,
				saved: input.saved ? 1 : existing.saved,
				browsed: 1,
				browsedAt: now,
				updatedAt: now,
			});
			return { id: existing.id, created: false };
		}

		const originKey = await originKeyFor(keys.index, input.url);
		const evict = input.saved
			? []
			: await pagesToEvict(ctx, keys, originKey);
		const id = crypto.randomUUID();
		const sealed = await sealBody<SaveContent>(keys, "saves", id, {
			url: input.url,
			title,
			customName: title,
			...(untitled ? { provisional: true as const } : {}),
		});
		await ctx.db.transaction("rw", cascadeTables(ctx.db), async () => {
			await removeRecords(ctx.db, keys.profileId, evict);
			await ctx.db.saves.add({
				id,
				profileId: keys.profileId,
				...sealed,
				createdAt: now,
				updatedAt: now,
				urlKey,
				originKey,
				saved: input.saved ? 1 : 0,
				browsed: 1,
				browsedAt: now,
				privacy: "private",
			});
		});
		return { id, created: true };
	},
});

// Renames, saves or unsaves a page, or removes it from history. A page that
// ends up neither saved nor in history is deleted.
export const saveUpdate = defineCommand({
	name: "save.update",
	parse: (input) => {
		const record = asRecord(input);
		return {
			id: asString(record.id, "id"),
			saved: optionalBoolean(record.saved, "saved"),
			browsed: optionalBoolean(record.browsed, "browsed"),
			archived: optionalBoolean(record.archived, "archived"),
			tags: optionalTags(record.tags),
			customName:
				record.customName === undefined
					? undefined
					: asString(record.customName, "customName")
							.trim()
							.slice(0, MAX_TITLE_LENGTH) ||
						fail("customName cannot be empty."),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await getOwnSave(ctx.db, keys, input.id);
		const saved = input.saved ?? row.saved === 1;
		const browsed = input.browsed ?? row.browsed === 1;

		if (!saved && !browsed) {
			await ctx.db.transaction("rw", cascadeTables(ctx.db), () =>
				removeRecords(ctx.db, keys.profileId, [row.id]),
			);
			return { deleted: true };
		}

		const content = await openSave(keys, row);
		const archived = input.archived ?? Boolean(content.archived);
		const tags = input.tags ?? content.tags ?? [];
		const sealed = await sealBody<SaveContent>(keys, "saves", row.id, {
			url: content.url,
			title: content.title,
			// A name the user gives is theirs, never a stand-in.
			...(input.customName === undefined
				? {
						customName: content.customName,
						...(content.provisional
							? { provisional: true as const }
							: {}),
					}
				: { customName: input.customName }),
			...(archived ? { archived: true } : {}),
			...(tags.length > 0 ? { tags } : {}),
		});
		const now = ctx.now();
		await ctx.db.transaction("rw", cascadeTables(ctx.db), async () => {
			// Unsaving detaches the page's notes, reminders and tasks, as
			// before format v1; the notes themselves stay.
			if (row.saved === 1 && !saved) {
				await ctx.db.links
					.where("[profileId+toId]")
					.equals([keys.profileId, row.id])
					.delete();
			}
			await ctx.db.saves.put({
				...row,
				...sealed,
				saved: saved ? 1 : 0,
				browsed: browsed ? 1 : 0,
				updatedAt: now,
			});
		});
		return { deleted: false };
	},
});

// Deletes a page with its notes, links and assets (decision 0012). A note
// that another page also has stays, and only loses its link to this page.
export const saveDelete = defineCommand({
	name: "save.delete",
	parse: (input) => ({ id: asString(asRecord(input).id, "id") }),
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await ctx.db.saves.get(input.id);
		// Already gone counts as done, so a retried delete succeeds.
		if (!row || row.profileId !== keys.profileId) {
			return null;
		}
		await ctx.db.transaction("rw", cascadeTables(ctx.db), async () => {
			const noteIds = (
				await ctx.db.links
					.where("[profileId+toId]")
					.equals([keys.profileId, row.id])
					.toArray()
			).map((link) => link.fromId);
			const notes = await ctx.db.notes.bulkGet(noteIds);
			const ownNoteIds: Array<string> = [];
			for (const note of notes) {
				if (
					note &&
					(await ctx.db.links
						.where("[profileId+fromId]")
						.equals([keys.profileId, note.id])
						.filter((link) => link.toId !== row.id)
						.count()) === 0
				) {
					ownNoteIds.push(note.id);
				}
			}
			await removeRecords(ctx.db, keys.profileId, [
				row.id,
				...ownNoteIds,
			]);
		});
		return null;
	},
});
