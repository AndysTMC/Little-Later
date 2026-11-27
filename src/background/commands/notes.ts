import { sealBody, type ProfileKeys } from "../../storage/keys";
import { verifyPassword } from "../../storage/profiles";
import { openNote, type NoteContent } from "../../storage/repositories";
import type { LittleDB, NoteRow } from "../../storage/schema";
import { cascadeTables, removeRecords } from "./cascade";
import {
	assertOwnSaves,
	optionalSaveIds,
	optionalTags,
	setSaveLinks,
} from "./records";
import {
	CommandError,
	asRecord,
	asString,
	defineCommand,
	fail,
} from "./registry";

const MAX_NOTE_LENGTH = 100_000;
const MAX_NOTE_TITLE_LENGTH = 100;

const asContent = (value: unknown): string => {
	const content = asString(value, "content");
	return content.trim() !== "" && content.length <= MAX_NOTE_LENGTH
		? content
		: fail(`content must be 1 to ${MAX_NOTE_LENGTH} characters.`);
};

const optionalBoolean = (value: unknown, field: string) =>
	value === undefined || typeof value === "boolean"
		? (value as boolean | undefined)
		: fail(`${field} must be a boolean.`);

const optionalTitle = (value: unknown): string | undefined => {
	if (value === undefined) return undefined;
	return asString(value, "title").trim().slice(0, MAX_NOTE_TITLE_LENGTH);
};

const optionalPassword = (value: unknown): string | undefined =>
	value === undefined ? undefined : asString(value, "password");

const verifyLockedNotePassword = async (
	db: LittleDB,
	profileId: string,
	password: string | undefined,
	action: "change" | "delete",
): Promise<void> => {
	const profile = await db.profiles.get(profileId);
	if (profile?.protection !== "password") {
		return;
	}
	if (!password) {
		throw new CommandError(
			"rejected",
			`Enter your profile password to ${action} a locked note.`,
		);
	}
	await verifyPassword(db, profileId, password);
};

const assertPasswordForLockedNote = async (
	db: LittleDB,
	profileId: string,
): Promise<void> => {
	const profile = await db.profiles.get(profileId);
	if (!profile || profile.protection !== "password") {
		throw new CommandError(
			"rejected",
			"Set a profile password in Security settings before locking a note.",
		);
	}
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
			tags: optionalTags(record.tags),
			locked: optionalBoolean(record.locked, "locked"),
			title: optionalTitle(record.title),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		await assertOwnSaves(ctx.db, keys, input.saveIds);
		if (input.locked) {
			await assertPasswordForLockedNote(ctx.db, keys.profileId);
		}
		const id = crypto.randomUUID();
		const now = ctx.now();
		const tags = input.tags ?? [];
		const title = input.title ?? "";
		const sealed = await sealBody<NoteContent>(keys, "notes", id, {
			content: input.content,
			...(input.locked ? { locked: true } : {}),
			...(title !== "" ? { title } : {}),
			...(tags.length > 0 ? { tags } : {}),
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
			tags: optionalTags(record.tags),
			locked: optionalBoolean(record.locked, "locked"),
			title: optionalTitle(record.title),
			password: optionalPassword(record.password),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await getOwnNote(ctx.db, keys, input.id);
		await assertOwnSaves(ctx.db, keys, input.saveIds);
		const existing = await openNote(keys, row);
		if (existing.locked) {
			await verifyLockedNotePassword(
				ctx.db,
				keys.profileId,
				input.password,
				"change",
			);
		}
		const locked = input.locked ?? Boolean(existing.locked);
		if (locked) {
			await assertPasswordForLockedNote(ctx.db, keys.profileId);
		}
		const tags = input.tags ?? existing.tags ?? [];
		const title = input.title ?? existing.title ?? "";
		const sealed = await sealBody<NoteContent>(keys, "notes", row.id, {
			content: input.content,
			...(locked ? { locked: true } : {}),
			...(title !== "" ? { title } : {}),
			...(tags.length > 0 ? { tags } : {}),
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
	parse: (input) => {
		const record = asRecord(input);
		return {
			id: asString(record.id, "id"),
			password: optionalPassword(record.password),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await ctx.db.notes.get(input.id);
		// Already gone counts as done, so a retried delete succeeds.
		if (!row || row.profileId !== keys.profileId) {
			return null;
		}
		const existing = await openNote(keys, row);
		if (existing.locked) {
			await verifyLockedNotePassword(
				ctx.db,
				keys.profileId,
				input.password,
				"delete",
			);
		}
		await ctx.db.transaction("rw", cascadeTables(ctx.db), () =>
			removeRecords(ctx.db, keys.profileId, [row.id]),
		);
		return null;
	},
});
