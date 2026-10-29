import {
	LMAX_TASK_INFORMATION_LENGTH,
	LMAX_TASK_LABEL_LENGTH,
} from "little-shared/constants";
import {
	ScheduleError,
	nextOccurrence,
	parseRule,
	resolveZone,
	toInstant,
	type RecurrenceRule,
} from "little-shared/utils/schedule";
import { sealBody, type ProfileKeys } from "../../storage/keys";
import {
	openTask,
	type ReminderContent,
	type TaskContent,
	type TaskPriority,
} from "../../storage/repositories";
import type {
	LittleDB,
	ReminderRow,
	TaskRow,
	TaskSchedule,
} from "../../storage/schema";
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
	type CommandContext,
} from "./registry";
import { ESCALATION, nextFireAfter } from "./reminders";

const PRIORITIES: ReadonlyArray<TaskPriority> = ["low", "medium", "high"];

export const asPriority = (value: unknown): TaskPriority =>
	PRIORITIES.includes(value as TaskPriority)
		? (value as TaskPriority)
		: fail("priority must be low, medium or high.");

export const asSchedule = (value: unknown): TaskSchedule => {
	const record = asRecord(value);
	switch (record.kind) {
		case "anytime":
			return { kind: "anytime" };
		case "due":
			return { kind: "due", at: asInstant(record.at, "schedule.at") };
		case "recurring":
			try {
				return { kind: "recurring", rule: parseRule(record.rule) };
			} catch (error) {
				return fail(
					error instanceof ScheduleError
						? error.message
						: "schedule.rule is not valid.",
				);
			}
		default:
			return fail("schedule.kind must be anytime, due or recurring.");
	}
};

type Deadline = Pick<TaskRow, "dueAt" | "occursOn">;

// The deadline the task's lists sort and filter by: for a recurring task,
// the first occurrence after `from`, and the civil date it falls on.
const deadlineFor = (
	ctx: CommandContext,
	schedule: TaskSchedule,
	from: number,
): Deadline => {
	switch (schedule.kind) {
		case "anytime":
			return { dueAt: 0, occursOn: null };
		case "due":
			return { dueAt: schedule.at, occursOn: null };
		case "recurring": {
			const dueAt = nextOccurrence(schedule.rule, from, ctx.zone());
			return {
				dueAt,
				occursOn: occurrenceDate(schedule.rule, dueAt, ctx.zone()),
			};
		}
	}
};

// The civil date that an occurrence at `dueAt` falls on, in the zone its
// rule resolves to.
export const occurrenceDate = (
	rule: RecurrenceRule,
	dueAt: number,
	deviceZone: string,
): string =>
	Temporal.Instant.fromEpochMilliseconds(dueAt)
		.toZonedDateTimeISO(resolveZone(rule, deviceZone))
		.toPlainDate()
		.toString();

export type TaskReminderKind = "normal" | "escalating";

const asReminderKind = (value: unknown): TaskReminderKind | null =>
	value === null || value === "normal" || value === "escalating"
		? value
		: fail("reminder must be normal, escalating or null.");

const NO_DEADLINE_REMINDER =
	"A task without a deadline cannot have a reminder.";

// A task's own reminder is the one reminder linked to it; nothing else
// links to a task.
const findTaskReminder = async (
	db: LittleDB,
	profileId: string,
	taskId: string,
): Promise<ReminderRow | undefined> => {
	const links = await db.links
		.where("[profileId+toId]")
		.equals([profileId, taskId])
		.toArray();
	const rows = await db.reminders.bulkGet(links.map((link) => link.fromId));
	return rows.find((row) => row !== undefined);
};

type TaskReminderChange =
	| { kind: "none" }
	| { kind: "remove"; id: string }
	| { kind: "put"; row: ReminderRow; isNew: boolean };

// Keeps a task's reminder in step with the task: at its deadline, saying
// what the task says, silent while the task is done. `kind` undefined
// keeps whatever reminder the task has and null removes it; `information`
// undefined keeps the reminder's text. Reads and seals only, so callers
// can write the change inside their transaction.
const planTaskReminder = async (
	ctx: CommandContext,
	keys: ProfileKeys,
	task: TaskRow,
	kind: TaskReminderKind | null | undefined,
	information: string | undefined,
): Promise<TaskReminderChange> => {
	const existing = await findTaskReminder(ctx.db, keys.profileId, task.id);
	const wanted =
		kind !== undefined
			? kind
			: existing
				? existing.escalation
					? "escalating"
					: "normal"
				: null;
	if (wanted === null || task.schedule.kind === "anytime") {
		return existing
			? { kind: "remove", id: existing.id }
			: { kind: "none" };
	}
	const now = ctx.now();
	const id = existing?.id ?? crypto.randomUUID();
	const escalation = wanted === "escalating" ? ESCALATION : null;
	// At the task's deadline; for a recurring task whose open occurrence
	// has passed, at the next one (0011: every occurrence fires).
	const target =
		task.schedule.kind === "recurring" && task.dueAt <= now
			? nextOccurrence(task.schedule.rule, now, ctx.zone())
			: task.dueAt;
	const sealed =
		information === undefined && existing
			? { keyId: existing.keyId, body: existing.body }
			: await sealBody<ReminderContent>(keys, "reminders", id, {
					message: information ?? "",
				});
	// Same time and kind, still armed: keep its place in the schedule.
	const unchanged =
		existing !== undefined &&
		existing.target === target &&
		(existing.escalation !== null) === (escalation !== null) &&
		existing.nextFireAt !== 0;
	return {
		kind: "put",
		isNew: existing === undefined,
		row: {
			id,
			profileId: keys.profileId,
			...sealed,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
			target,
			escalation,
			lastFiredAt: unchanged ? existing.lastFiredAt : 0,
			nextFireAt:
				task.done === 1
					? 0
					: unchanged
						? existing.nextFireAt
						: nextFireAfter(target, escalation, now),
			privacy: existing?.privacy ?? "private",
		},
	};
};

// Call inside a transaction over cascadeTables.
const applyTaskReminder = async (
	db: LittleDB,
	task: TaskRow,
	change: TaskReminderChange,
): Promise<void> => {
	switch (change.kind) {
		case "none":
			return;
		case "remove":
			return removeRecords(db, task.profileId, [change.id]);
		case "put":
			await db.reminders.put(change.row);
			if (change.isNew) {
				await db.links.add({
					id: crypto.randomUUID(),
					profileId: task.profileId,
					fromId: change.row.id,
					toId: task.id,
					createdAt: change.row.createdAt,
				});
			}
	}
};

// Writes a task and keeps its reminder in step.
const putTask = async (
	ctx: CommandContext,
	keys: ProfileKeys,
	task: TaskRow,
	reminder: TaskReminderKind | null | undefined,
	information: string | undefined,
): Promise<void> => {
	const change = await planTaskReminder(
		ctx,
		keys,
		task,
		reminder,
		information,
	);
	await ctx.db.transaction("rw", cascadeTables(ctx.db), async () => {
		await ctx.db.tasks.put(task);
		await applyTaskReminder(ctx.db, task, change);
	});
};

const getOwnTask = async (
	db: LittleDB,
	keys: ProfileKeys,
	id: string,
): Promise<TaskRow> => {
	const row = await db.tasks.get(id);
	if (!row || row.profileId !== keys.profileId) {
		throw new CommandError("rejected", "Task not found.");
	}
	return row;
};

const asContentFields = (record: Record<string, unknown>) => ({
	information: boundedText(
		record.information,
		"information",
		LMAX_TASK_INFORMATION_LENGTH,
	),
	label:
		record.label === undefined
			? ""
			: boundedText(record.label, "label", LMAX_TASK_LABEL_LENGTH, true),
	priority:
		record.priority === undefined ? "medium" : asPriority(record.priority),
});

export const taskCreate = defineCommand({
	name: "task.create",
	parse: (input) => {
		const record = asRecord(input);
		const schedule = asSchedule(record.schedule);
		const reminder =
			record.reminder === undefined
				? null
				: asReminderKind(record.reminder);
		if (reminder !== null && schedule.kind === "anytime") {
			fail(NO_DEADLINE_REMINDER);
		}
		return {
			...asContentFields(record),
			schedule,
			reminder,
			saveId: optionalSaveId(record.saveId),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		await assertOwnSave(ctx.db, keys, input.saveId);
		const id = crypto.randomUUID();
		const now = ctx.now();
		const sealed = await sealBody<TaskContent>(keys, "tasks", id, {
			information: input.information,
			label: input.label,
			priority: input.priority,
		});
		const task: TaskRow = {
			id,
			profileId: keys.profileId,
			...sealed,
			createdAt: now,
			updatedAt: now,
			schedule: input.schedule,
			...deadlineFor(ctx, input.schedule, now),
			done: 0,
			finishedAt: 0,
			privacy: "private",
		};
		const change = await planTaskReminder(
			ctx,
			keys,
			task,
			input.reminder,
			input.information,
		);
		await ctx.db.transaction("rw", cascadeTables(ctx.db), async () => {
			await ctx.db.tasks.add(task);
			await linkToSave(ctx.db, keys.profileId, id, input.saveId, now);
			await applyTaskReminder(ctx.db, task, change);
		});
		return { id };
	},
});

export const taskUpdate = defineCommand({
	name: "task.update",
	parse: (input) => {
		const record = asRecord(input);
		return {
			id: asString(record.id, "id"),
			information:
				record.information === undefined
					? undefined
					: boundedText(
							record.information,
							"information",
							LMAX_TASK_INFORMATION_LENGTH,
						),
			label:
				record.label === undefined
					? undefined
					: boundedText(
							record.label,
							"label",
							LMAX_TASK_LABEL_LENGTH,
							true,
						),
			priority:
				record.priority === undefined
					? undefined
					: asPriority(record.priority),
			schedule:
				record.schedule === undefined
					? undefined
					: asSchedule(record.schedule),
			reminder:
				record.reminder === undefined
					? undefined
					: asReminderKind(record.reminder),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await getOwnTask(ctx.db, keys, input.id);
		const content = await openTask(keys, row);
		const information = input.information ?? content.information;
		const sealed = await sealBody<TaskContent>(keys, "tasks", row.id, {
			information,
			label: input.label ?? content.label,
			priority: input.priority ?? content.priority,
		});
		const now = ctx.now();
		const schedule = input.schedule ?? row.schedule;
		if (input.reminder && schedule.kind === "anytime") {
			throw new CommandError("invalid-input", NO_DEADLINE_REMINDER);
		}
		await putTask(
			ctx,
			keys,
			{
				...row,
				...sealed,
				schedule,
				...(input.schedule ? deadlineFor(ctx, schedule, now) : {}),
				updatedAt: now,
			},
			input.reminder,
			information,
		);
		return null;
	},
});

// Finishes a task. A recurring task stays open and moves on to its next
// occurrence after both now and the one it was on.
export const taskComplete = defineCommand({
	name: "task.complete",
	parse: (input) => ({ id: asString(asRecord(input).id, "id") }),
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await getOwnTask(ctx.db, keys, input.id);
		const now = ctx.now();
		const recurring = row.schedule.kind === "recurring";
		const deadline = recurring
			? deadlineFor(ctx, row.schedule, Math.max(now, row.dueAt))
			: {};
		const task: TaskRow = {
			...row,
			...deadline,
			done: recurring ? 0 : 1,
			finishedAt: now,
			updatedAt: now,
		};
		await putTask(ctx, keys, task, undefined, undefined);
		return { dueAt: task.dueAt };
	},
});

export const taskReopen = defineCommand({
	name: "task.reopen",
	parse: (input) => ({ id: asString(asRecord(input).id, "id") }),
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await getOwnTask(ctx.db, keys, input.id);
		if (row.schedule.kind === "recurring") {
			throw new CommandError(
				"rejected",
				"A recurring task stays open; it cannot be reopened.",
			);
		}
		await putTask(
			ctx,
			keys,
			{ ...row, done: 0, finishedAt: 0, updatedAt: ctx.now() },
			undefined,
			undefined,
		);
		return null;
	},
});

export const taskDelete = defineCommand({
	name: "task.delete",
	parse: (input) => ({ id: asString(asRecord(input).id, "id") }),
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await ctx.db.tasks.get(input.id);
		// Already gone counts as done, so a retried delete succeeds.
		if (!row || row.profileId !== keys.profileId) {
			return null;
		}
		const reminder = await findTaskReminder(ctx.db, keys.profileId, row.id);
		await ctx.db.transaction("rw", cascadeTables(ctx.db), () =>
			removeRecords(
				ctx.db,
				keys.profileId,
				reminder ? [row.id, reminder.id] : [row.id],
			),
		);
		return null;
	},
});

const DAY = 86_400_000;

// Moves each open recurring task, with its reminder, to its occurrence's
// civil date and time in the device's current zone (0011): a floating
// 09:00 is 09:00 wherever the device is. A rule with its own zone resolves
// as before, so it does not move. Plain fields only, so it runs while
// locked; the scheduler calls it before each run.
export const followDeviceZone = async (
	db: LittleDB,
	zone: string,
	now: number,
): Promise<void> => {
	// Rows from builds before occursOn have none, and keep their deadline
	// until the task is next completed or rescheduled.
	const open = await db.tasks
		.filter((task) => task.done === 0 && typeof task.occursOn === "string")
		.toArray();
	for (const task of open) {
		if (task.schedule.kind !== "recurring" || task.occursOn === null) {
			continue;
		}
		const { rule } = task.schedule;
		const occursOn = Temporal.PlainDate.from(task.occursOn);
		const dueAt = toInstant(occursOn, rule.time, resolveZone(rule, zone));
		await db.transaction("rw", cascadeTables(db), async () => {
			const reminder = await findTaskReminder(
				db,
				task.profileId,
				task.id,
			);
			if (dueAt !== task.dueAt) {
				await db.tasks.update(task.id, { dueAt });
			}
			if (
				reminder &&
				reminder.target !== task.dueAt &&
				reminder.nextFireAt !== 0
			) {
				// Already moved on to a later occurrence, after reminding of
				// the open one. Its offset can change when the open one's does
				// not, so re-resolve its date too. Both times came from one
				// zone, whose offset differs between them by a daylight saving
				// shift, never half a day: the whole days between them are its
				// date's distance from the open one's.
				const later = occursOn.add({
					days: Math.round((reminder.target - task.dueAt) / DAY),
				});
				const target = toInstant(
					later,
					rule.time,
					resolveZone(rule, zone),
				);
				if (target !== reminder.target) {
					await db.reminders.update(reminder.id, {
						target,
						// One whose new time has passed fires now.
						nextFireAt:
							target <= now
								? now
								: nextFireAfter(
										target,
										reminder.escalation,
										now,
									),
					});
				}
			} else if (
				reminder &&
				reminder.target === task.dueAt &&
				dueAt !== task.dueAt
			) {
				await db.reminders.update(reminder.id, {
					target: dueAt,
					// One that already fired its last stays quiet; one whose
					// new time has passed fires now.
					nextFireAt:
						reminder.nextFireAt === 0
							? 0
							: dueAt <= now
								? now
								: nextFireAfter(
										dueAt,
										reminder.escalation,
										now,
									),
				});
			}
		});
	}
};

// The next time a task's reminder fires once it has fired at its target:
// the following occurrence of its task's rule, while the task recurs and
// is open, so it reminds at every occurrence (0011). null for any other
// reminder, which is then done.
export const nextTaskOccurrence = async (
	db: LittleDB,
	reminder: ReminderRow,
	zone: string,
	now: number,
): Promise<number | null> => {
	const links = await db.links
		.where("[profileId+fromId]")
		.equals([reminder.profileId, reminder.id])
		.toArray();
	for (const link of links) {
		const task = await db.tasks.get(link.toId);
		if (task?.schedule.kind === "recurring" && task.done === 0) {
			return nextOccurrence(task.schedule.rule, now, zone);
		}
	}
	return null;
};
