import { sealBody, type ProfileKeys } from "../../storage/keys";
import type { NoteContent } from "../../storage/repositories";
import type { LittleDB, NoteRow } from "../../storage/schema";
import { cascadeTables, removeRecords } from "./cascade";
import { assertOwnSaves, optionalSaveIds, setSaveLinks } from "./records";
import {
	CommandError,
	asRecord,
	asString,
	defineCommand,
	fail,
} from "./registry";

const MAX_NOTE_LENGTH = 100_000;

const asContent = (value: unknown): string => {
	const content = asString(value, "content");
	return content.trim() !== "" && content.length <= MAX_NOTE_LENGTH
		? content
		: fail(`content must be 1 to ${MAX_NOTE_LENGTH} characters.`);
};

const getOwnNote = async (
	db: LittleDB,
	keys: ProfileKeys,
	id: string,
): Promise<NoteRow> => {
	const row = await db.notes.get(id);
	if (!row || row.profileId !== keys.profileId) {
		throw new CommandError("rejected", "Note not found.");
	}
	return row;
};

// Creates a note, optionally attached to a save.
export const noteCreate = defineCommand({
	name: "note.create",
	parse: (input) => {
		const record = asRecord(input);
		return {
			content: asContent(record.content),
			saveIds: optionalSaveIds(record.saveIds),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		await assertOwnSaves(ctx.db, keys, input.saveIds);
		const id = crypto.randomUUID();
		const now = ctx.now();
		const sealed = await sealBody<NoteContent>(keys, "notes", id, {
			content: input.content,
		});
		await ctx.db.transaction(
			"rw",
			[ctx.db.notes, ctx.db.links, ctx.db.saves],
			async () => {
				await ctx.db.notes.add({
					id,
					profileId: keys.profileId,
					...sealed,
					createdAt: now,
					updatedAt: now,
					privacy: "private",
				});
				await setSaveLinks(
					ctx.db,
					keys.profileId,
					id,
					input.saveIds ?? [],
					now,
				);
			},
		);
		return { id };
	},
});

export const noteUpdate = defineCommand({
	name: "note.update",
	parse: (input) => {
		const record = asRecord(input);
		return {
			id: asString(record.id, "id"),
			content: asContent(record.content),
			// Given, the exact saves the note is attached to afterwards.
			saveIds: optionalSaveIds(record.saveIds),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await getOwnNote(ctx.db, keys, input.id);
		await assertOwnSaves(ctx.db, keys, input.saveIds);
		const sealed = await sealBody<NoteContent>(keys, "notes", row.id, {
			content: input.content,
		});
		const now = ctx.now();
		await ctx.db.transaction(
			"rw",
			[ctx.db.notes, ctx.db.links, ctx.db.saves],
			async () => {
				await ctx.db.notes.put({ ...row, ...sealed, updatedAt: now });
				if (input.saveIds) {
					await setSaveLinks(
						ctx.db,
						keys.profileId,
						row.id,
						input.saveIds,
						now,
					);
				}
			},
		);
		return null;
	},
});

export const noteDelete = defineCommand({
	name: "note.delete",
	parse: (input) => ({ id: asString(asRecord(input).id, "id") }),
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await ctx.db.notes.get(input.id);
		// Already gone counts as done, so a retried delete succeeds.
		if (!row || row.profileId !== keys.profileId) {
			return null;
		}
		await ctx.db.transaction("rw", cascadeTables(ctx.db), () =>
			removeRecords(ctx.db, keys.profileId, [row.id]),
		);
		return null;
	},
});
