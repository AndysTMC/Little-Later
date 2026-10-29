import type { ProfileKeys } from "../../storage/keys";
import type { LittleDB } from "../../storage/schema";
import { CommandError, asRecord, asString, defineCommand } from "./registry";

// What can point at what, as before format v1: notes, tasks and reminders
// attach to saves, and a reminder can be about a task.
type Kind = "save" | "note" | "task" | "reminder";
const ALLOWED: ReadonlyArray<readonly [Kind, Kind]> = [
	["note", "save"],
	["task", "save"],
	["reminder", "save"],
	["reminder", "task"],
];

const kindOf = async (
	db: LittleDB,
	keys: ProfileKeys,
	id: string,
): Promise<Kind | null> => {
	const tables = [
		["save", db.saves],
		["note", db.notes],
		["task", db.tasks],
		["reminder", db.reminders],
	] as const;
	for (const [kind, table] of tables) {
		const row = await table.get(id);
		if (row) {
			return row.profileId === keys.profileId ? kind : null;
		}
	}
	return null;
};

const parseEnds = (input: unknown) => {
	const record = asRecord(input);
	return {
		fromId: asString(record.fromId, "fromId"),
		toId: asString(record.toId, "toId"),
	};
};

const findLink = (
	db: LittleDB,
	profileId: string,
	fromId: string,
	toId: string,
) =>
	db.links
		.where("[profileId+fromId]")
		.equals([profileId, fromId])
		.filter((link) => link.toId === toId)
		.first();

export const linkCreate = defineCommand({
	name: "link.create",
	parse: parseEnds,
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const from = await kindOf(ctx.db, keys, input.fromId);
		const to = await kindOf(ctx.db, keys, input.toId);
		if (!from || !to || !ALLOWED.some(([a, b]) => a === from && b === to)) {
			throw new CommandError(
				"rejected",
				"These records cannot be linked.",
			);
		}
		await ctx.db.transaction("rw", ctx.db.links, async () => {
			// Linking twice keeps one link.
			if (
				await findLink(ctx.db, keys.profileId, input.fromId, input.toId)
			) {
				return;
			}
			await ctx.db.links.add({
				id: crypto.randomUUID(),
				profileId: keys.profileId,
				fromId: input.fromId,
				toId: input.toId,
				createdAt: ctx.now(),
			});
		});
		return null;
	},
});

export const linkDelete = defineCommand({
	name: "link.delete",
	parse: parseEnds,
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		await ctx.db.links
			.where("[profileId+fromId]")
			.equals([keys.profileId, input.fromId])
			.filter((link) => link.toId === input.toId)
			.delete();
		return null;
	},
});
