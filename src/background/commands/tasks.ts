import {
	LMAX_TASK_INFORMATION_LENGTH,
	LMAX_TASK_LABEL_LENGTH,
} from "little-shared/constants";
import {
	ScheduleError,
	nextOccurrence,
	parseRule,
} from "little-shared/utils/schedule";
import { sealBody, type ProfileKeys } from "../../storage/keys";
import {
	openTask,
	type TaskContent,
	type TaskPriority,
} from "../../storage/repositories";
import type { LittleDB, TaskRow, TaskSchedule } from "../../storage/schema";
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

const PRIORITIES: ReadonlyArray<TaskPriority> = ["low", "medium", "high"];

const asPriority = (value: unknown): TaskPriority =>
	PRIORITIES.includes(value as TaskPriority)
		? (value as TaskPriority)
		: fail("priority must be low, medium or high.");

const asSchedule = (value: unknown): TaskSchedule => {
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

// The deadline the task's lists sort and filter by: for a recurring task,
// the first occurrence after `from`.
const dueAtFor = (
	ctx: CommandContext,
	schedule: TaskSchedule,
	from: number,
): number => {
	switch (schedule.kind) {
		case "anytime":
			return 0;
		case "due":
			return schedule.at;
		case "recurring":
			return nextOccurrence(schedule.rule, from, ctx.zone());
	}
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
		return {
			...asContentFields(record),
			schedule: asSchedule(record.schedule),
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
		await ctx.db.transaction(
			"rw",
			[ctx.db.tasks, ctx.db.links],
			async () => {
				await ctx.db.tasks.add({
					id,
					profileId: keys.profileId,
					...sealed,
					createdAt: now,
					updatedAt: now,
					schedule: input.schedule,
					dueAt: dueAtFor(ctx, input.schedule, now),
					done: 0,
					finishedAt: 0,
					privacy: "private",
				});
				await linkToSave(ctx.db, keys.profileId, id, input.saveId, now);
			},
		);
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
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await getOwnTask(ctx.db, keys, input.id);
		const content = await openTask(keys, row);
		const sealed = await sealBody<TaskContent>(keys, "tasks", row.id, {
			information: input.information ?? content.information,
			label: input.label ?? content.label,
			priority: input.priority ?? content.priority,
		});
		const now = ctx.now();
		const schedule = input.schedule ?? row.schedule;
		await ctx.db.tasks.put({
			...row,
			...sealed,
			schedule,
			dueAt: input.schedule ? dueAtFor(ctx, schedule, now) : row.dueAt,
			updatedAt: now,
		});
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
		const dueAt = recurring
			? dueAtFor(ctx, row.schedule, Math.max(now, row.dueAt))
			: row.dueAt;
		await ctx.db.tasks.put({
			...row,
			done: recurring ? 0 : 1,
			finishedAt: now,
			dueAt,
			updatedAt: now,
		});
		return { dueAt };
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
		await ctx.db.tasks.put({
			...row,
			done: 0,
			finishedAt: 0,
			updatedAt: ctx.now(),
		});
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
		await ctx.db.transaction("rw", cascadeTables(ctx.db), () =>
			removeRecords(ctx.db, keys.profileId, [row.id]),
		);
		return null;
	},
});
