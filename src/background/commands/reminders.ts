import { LMAX_REMINDER_MESSAGE_LENGTH } from "little-shared/constants";
import {
	nextEscalationFire,
	type Escalation,
} from "little-shared/utils/schedule";
import { sealBody, type ProfileKeys } from "../../storage/keys";
import { openReminder, type ReminderContent } from "../../storage/repositories";
import type { LittleDB, ReminderRow } from "../../storage/schema";
import { cascadeTables, removeRecords } from "./cascade";
import {
	assertOwnSaves,
	asInstant,
	boundedText,
	setSaveLinks,
	optionalSaveIds,
} from "./records";
import {
	CommandError,
	asRecord,
	asString,
	defineCommand,
	fail,
} from "./registry";

// Escalation as before format v1 (decision 0011): stop 15 minutes early,
// then fire at the target.
export const ESCALATION: Escalation = { escalate: true, stopBefore: 15 };

const optionalBoolean = (value: unknown, field: string) =>
	value === undefined || typeof value === "boolean"
		? (value as boolean | undefined)
		: fail(`${field} must be a boolean.`);

// When a reminder fires next, given when it last fired (or was set).
// Exported for the alarm scheduler, which advances reminders after firing.
export const nextFireAfter = (
	target: number,
	escalation: Escalation | null,
	from: number,
): number => {
	if (from >= target) {
		return 0;
	}
	return escalation ? nextEscalationFire(from, target, escalation) : target;
};

const getOwnReminder = async (
	db: LittleDB,
	keys: ProfileKeys,
	id: string,
): Promise<ReminderRow> => {
	const row = await db.reminders.get(id);
	if (!row || row.profileId !== keys.profileId) {
		throw new CommandError("rejected", "Reminder not found.");
	}
	return row;
};

// A reminder linked to a task is that task's own reminder: it follows the
// task's deadline and text, and goes when the task does. Changing it here
// would be undone by the next task command, or leave the two out of step,
// so the worker refuses it for every caller, not only the popup (0012).
const TASK_OWNED = "Change or remove this reminder on its task.";

const isTaskReminder = async (
	db: LittleDB,
	profileId: string,
	reminderId: string,
): Promise<boolean> => {
	const links = await db.links
		.where("[profileId+fromId]")
		.equals([profileId, reminderId])
		.toArray();
	const tasks = await db.tasks.bulkGet(links.map((link) => link.toId));
	return tasks.some((task) => task?.profileId === profileId);
};

const assertFuture = (target: number, now: number) => {
	if (target <= now) {
		throw new CommandError("rejected", "A reminder must be in the future.");
	}
};

export const reminderCreate = defineCommand({
	name: "reminder.create",
	parse: (input) => {
		const record = asRecord(input);
		return {
			message: boundedText(
				record.message,
				"message",
				LMAX_REMINDER_MESSAGE_LENGTH,
			),
			target: asInstant(record.target, "target"),
			escalate: optionalBoolean(record.escalate, "escalate"),
			saveIds: optionalSaveIds(record.saveIds),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const now = ctx.now();
		assertFuture(input.target, now);
		await assertOwnSaves(ctx.db, keys, input.saveIds);
		const id = crypto.randomUUID();
		const escalation = input.escalate ? ESCALATION : null;
		const sealed = await sealBody<ReminderContent>(keys, "reminders", id, {
			message: input.message,
		});
		await ctx.db.transaction(
			"rw",
			[ctx.db.reminders, ctx.db.links, ctx.db.saves],
			async () => {
				await ctx.db.reminders.add({
					id,
					profileId: keys.profileId,
					...sealed,
					createdAt: now,
					updatedAt: now,
					target: input.target,
					escalation,
					lastFiredAt: 0,
					nextFireAt: nextFireAfter(input.target, escalation, now),
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

// Changing the target or escalation starts the schedule again from now.
export const reminderUpdate = defineCommand({
	name: "reminder.update",
	parse: (input) => {
		const record = asRecord(input);
		return {
			id: asString(record.id, "id"),
			message:
				record.message === undefined
					? undefined
					: boundedText(
							record.message,
							"message",
							LMAX_REMINDER_MESSAGE_LENGTH,
						),
			target:
				record.target === undefined
					? undefined
					: asInstant(record.target, "target"),
			escalate: optionalBoolean(record.escalate, "escalate"),
			// Given, the exact saves the reminder is attached to afterwards.
			saveIds: optionalSaveIds(record.saveIds),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await getOwnReminder(ctx.db, keys, input.id);
		await assertOwnSaves(ctx.db, keys, input.saveIds);
		const now = ctx.now();
		const rescheduled =
			input.target !== undefined || input.escalate !== undefined;
		if (
			(rescheduled || input.message !== undefined) &&
			(await isTaskReminder(ctx.db, keys.profileId, row.id))
		) {
			throw new CommandError("rejected", TASK_OWNED);
		}
		const target = input.target ?? row.target;
		const escalation =
			input.escalate === undefined
				? row.escalation
				: input.escalate
					? ESCALATION
					: null;
		if (rescheduled) {
			assertFuture(target, now);
		}
		const content = await openReminder(keys, row);
		const sealed = await sealBody<ReminderContent>(
			keys,
			"reminders",
			row.id,
			{
				message: input.message ?? content.message,
			},
		);
		await ctx.db.transaction(
			"rw",
			[ctx.db.reminders, ctx.db.links, ctx.db.saves],
			async () => {
				await ctx.db.reminders.put({
					...row,
					...sealed,
					target,
					escalation,
					lastFiredAt: rescheduled ? 0 : row.lastFiredAt,
					nextFireAt: rescheduled
						? nextFireAfter(target, escalation, now)
						: row.nextFireAt,
					updatedAt: now,
				});
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

export const reminderDelete = defineCommand({
	name: "reminder.delete",
	parse: (input) => ({ id: asString(asRecord(input).id, "id") }),
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await ctx.db.reminders.get(input.id);
		// Already gone counts as done, so a retried delete succeeds.
		if (!row || row.profileId !== keys.profileId) {
			return null;
		}
		if (await isTaskReminder(ctx.db, keys.profileId, row.id)) {
			throw new CommandError("rejected", TASK_OWNED);
		}
		await ctx.db.transaction("rw", cascadeTables(ctx.db), () =>
			removeRecords(ctx.db, keys.profileId, [row.id]),
		);
		return null;
	},
});
