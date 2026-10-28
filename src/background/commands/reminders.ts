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
	assertOwnSave,
	asInstant,
	boundedText,
	linkToSave,
	optionalSaveId,
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
const ESCALATION: Escalation = { escalate: true, stopBefore: 15 };

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
			escalate: optionalBoolean(record.escalate, "escalate") ?? false,
			saveId: optionalSaveId(record.saveId),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const now = ctx.now();
		assertFuture(input.target, now);
		await assertOwnSave(ctx.db, keys, input.saveId);
		const id = crypto.randomUUID();
		const escalation = input.escalate ? ESCALATION : null;
		const sealed = await sealBody<ReminderContent>(keys, "reminders", id, {
			message: input.message,
		});
		await ctx.db.transaction(
			"rw",
			[ctx.db.reminders, ctx.db.links],
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
				await linkToSave(ctx.db, keys.profileId, id, input.saveId, now);
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
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await getOwnReminder(ctx.db, keys, input.id);
		const now = ctx.now();
		const rescheduled =
			input.target !== undefined || input.escalate !== undefined;
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
		await ctx.db.transaction("rw", cascadeTables(ctx.db), () =>
			removeRecords(ctx.db, keys.profileId, [row.id]),
		);
		return null;
	},
});
