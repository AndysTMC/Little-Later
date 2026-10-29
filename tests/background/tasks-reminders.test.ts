// @vitest-environment node
// Node, not jsdom: see tests/storage/profiles.test.ts.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands } from "../../src/background/commands";
import { nextFireAfter } from "../../src/background/commands/reminders";
import { followDeviceZone } from "../../src/background/commands/tasks";
import {
	createCommandContext,
	createDispatcher,
	type CommandResult,
	type Dispatch,
} from "../../src/background/commands/registry";
import { importProfileKeys } from "../../src/storage/keys";
import {
	listReminders,
	listTasks,
	openReminder,
} from "../../src/storage/repositories";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import {
	createMemorySessionStore,
	type SessionStore,
} from "../../src/storage/session";

const NY = "America/New_York";
const MINUTE = 60_000;
const at = (zoned: string) =>
	Temporal.ZonedDateTime.from(zoned).epochMilliseconds;

let db: LittleDB;
let session: SessionStore;
let clock: number;
let zone: string;
let dispatch: Dispatch;

const value = <T>(result: CommandResult<unknown>): T => {
	if (!result.ok)
		throw new Error(`${result.error.code}: ${result.error.message}`);
	return result.value as T;
};
const run = async <T>(name: string, input: unknown): Promise<T> =>
	value<T>(await dispatch(name, input));
const keys = async () => importProfileKeys((await session.get())!);

const daily = {
	freq: "daily",
	interval: 1,
	time: "09:00",
	anchor: "2026-03-01",
	zone: "floating",
};

beforeEach(async () => {
	db = openLittleDB(`little-test-${crypto.randomUUID()}`);
	await db.open();
	session = createMemorySessionStore();
	clock = at(`2026-03-07T12:00[${NY}]`);
	zone = NY;
	dispatch = createDispatcher(
		commands,
		createCommandContext(
			db,
			session,
			() => clock,
			() => zone,
		),
	);
	await run("profile.create", { name: "Ada", password: null });
});

afterEach(async () => {
	await db.delete();
});

describe("tasks", () => {
	it("creates tasks of each kind, sealed, with plain deadlines", async () => {
		const due = at(`2026-03-10T17:00[${NY}]`);
		await run("task.create", {
			information: "Buy milk",
			schedule: { kind: "anytime" },
		});
		await run("task.create", {
			information: "File taxes",
			label: "home",
			priority: "high",
			schedule: { kind: "due", at: due },
		});
		await run("task.create", {
			information: "Stand-up",
			schedule: { kind: "recurring", rule: daily },
		});

		const open = await listTasks(db, await keys());
		expect(open.map((t) => [t.information, t.dueAt])).toEqual([
			// Tomorrow's 09:00, across the spring-forward night.
			["Stand-up", at(`2026-03-08T09:00[${NY}]`)],
			["File taxes", due],
			["Buy milk", 0],
		]);
		expect(open[1]).toMatchObject({ label: "home", priority: "high" });
		const raw = JSON.stringify(await db.tasks.toArray(), (_, v) =>
			v instanceof Uint8Array ? new TextDecoder().decode(v) : v,
		);
		expect(raw).not.toContain("taxes");
	});

	it("completes and reopens a one-off task", async () => {
		const { id } = await run<{ id: string }>("task.create", {
			information: "Once",
			schedule: { kind: "anytime" },
		});
		await run("task.complete", { id });
		expect(await listTasks(db, await keys(), true)).toHaveLength(1);
		await run("task.reopen", { id });
		expect(await listTasks(db, await keys(), false)).toHaveLength(1);
	});

	it("moves a recurring task on when completed, even early or late", async () => {
		const { id } = await run<{ id: string }>("task.create", {
			information: "Stand-up",
			schedule: { kind: "recurring", rule: daily },
		});
		// Completed early, before its 09:00: the next one is the day after.
		expect(await run("task.complete", { id })).toEqual({
			dueAt: at(`2026-03-09T09:00[${NY}]`),
		});
		// Completed three days late: the next one is after now.
		clock = at(`2026-03-12T10:00[${NY}]`);
		expect(await run("task.complete", { id })).toEqual({
			dueAt: at(`2026-03-13T09:00[${NY}]`),
		});
		expect(await dispatch("task.reopen", { id })).toMatchObject({
			ok: false,
			error: { code: "rejected" },
		});
	});

	it("recomputes a floating recurring deadline in the device's zone", async () => {
		zone = "Europe/Berlin";
		const { id } = await run<{ id: string }>("task.create", {
			information: "Stand-up",
			schedule: { kind: "recurring", rule: daily },
		});
		const [task] = await listTasks(db, await keys());
		expect(task.id).toBe(id);
		expect(task.dueAt).toBe(at("2026-03-08T09:00[Europe/Berlin]"));
	});

	// 0011: a floating 09:00 is 09:00 wherever the device is now. The task
	// and its reminder kept the instant worked out in the earlier zone.
	describe("after the device changes zone", () => {
		const standUp = (rule = daily) =>
			run<{ id: string }>("task.create", {
				information: "Stand-up",
				schedule: { kind: "recurring", rule },
				reminder: "normal",
			});
		const state = async () => {
			const [task] = await db.tasks.toArray();
			const [reminder] = await db.reminders.toArray();
			return {
				dueAt: task.dueAt,
				target: reminder.target,
				nextFireAt: reminder.nextFireAt,
			};
		};

		it("moves a floating task and its reminder to the same civil time", async () => {
			await standUp();
			zone = "Europe/Berlin";
			await followDeviceZone(db, zone, clock);
			const berlin = at("2026-03-08T09:00[Europe/Berlin]");
			expect(await state()).toEqual({
				dueAt: berlin,
				target: berlin,
				nextFireAt: berlin,
			});
			// Running again changes nothing.
			await followDeviceZone(db, zone, clock);
			expect((await state()).dueAt).toBe(berlin);
		});

		it("leaves a task stored without an occurrence date alone", async () => {
			await standUp();
			const [task] = await db.tasks.toArray();
			const older: Partial<typeof task> = { ...task };
			delete older.occursOn;
			await db.tasks.put(older as typeof task);
			const before = await state();
			zone = "Europe/Berlin";
			await followDeviceZone(db, zone, clock);
			expect(await state()).toEqual(before);
		});

		it("keeps a task whose rule has its own zone", async () => {
			await standUp({ ...daily, zone: NY });
			const before = await state();
			zone = "Europe/Berlin";
			await followDeviceZone(db, zone, clock);
			expect(await state()).toEqual(before);
		});

		it("fires the reminder now when its new time has passed", async () => {
			clock = at(`2026-03-08T05:00[${NY}]`);
			await standUp();
			zone = "Europe/Berlin";
			await followDeviceZone(db, zone, clock);
			expect(await state()).toEqual({
				dueAt: at("2026-03-08T09:00[Europe/Berlin]"),
				target: at("2026-03-08T09:00[Europe/Berlin]"),
				nextFireAt: clock,
			});
		});

		it("moves on from the occurrence it is on after completion", async () => {
			const { id } = await standUp();
			await run("task.complete", { id });
			zone = "Asia/Kolkata";
			await followDeviceZone(db, zone, clock);
			expect((await state()).dueAt).toBe(
				at("2026-03-09T09:00[Asia/Kolkata]"),
			);
		});
	});

	it("updates text and schedule", async () => {
		const { id } = await run<{ id: string }>("task.create", {
			information: "Draft",
			schedule: { kind: "anytime" },
		});
		const due = at(`2026-04-01T09:00[${NY}]`);
		await run("task.update", {
			id,
			information: "Final",
			schedule: { kind: "due", at: due },
		});
		const [task] = await listTasks(db, await keys());
		expect(task).toMatchObject({ information: "Final", dueAt: due });
	});

	it.each([
		[{ information: "", schedule: { kind: "anytime" } }],
		[{ information: "x".repeat(257), schedule: { kind: "anytime" } }],
		[
			{
				information: "x",
				priority: "urgent",
				schedule: { kind: "anytime" },
			},
		],
		[{ information: "x", schedule: { kind: "someday" } }],
		[{ information: "x", schedule: { kind: "due", at: -5 } }],
		[
			{
				information: "x",
				schedule: {
					kind: "recurring",
					rule: { ...daily, time: "9am" },
				},
			},
		],
	])("refuses %j", async (input) => {
		expect(await dispatch("task.create", input)).toMatchObject({
			ok: false,
			error: { code: "invalid-input" },
		});
		expect(await db.tasks.count()).toBe(0);
	});

	it("deletes with its links, and attaches only to own saves", async () => {
		const { id: saveId } = await run<{ id: string }>("save.capture", {
			url: "https://a.test/",
			title: "A",
			saved: true,
		});
		const { id } = await run<{ id: string }>("task.create", {
			information: "Read it",
			schedule: { kind: "anytime" },
			saveId,
		});
		expect(await db.links.count()).toBe(1);
		await run("task.delete", { id });
		await run("task.delete", { id });
		expect(await db.tasks.count()).toBe(0);
		expect(await db.links.count()).toBe(0);
		expect(
			await dispatch("task.create", {
				information: "x",
				schedule: { kind: "anytime" },
				saveId: "missing",
			}),
		).toMatchObject({ ok: false, error: { code: "rejected" } });
	});
});

describe("a task's reminder", () => {
	const due = () => at(`2026-03-10T17:00[${NY}]`);
	// Every reminder, fired or not; listReminders shows only pending ones.
	const taskReminders = async () => {
		const profileKeys = await keys();
		return Promise.all(
			(await db.reminders.toArray()).map((row) =>
				openReminder(profileKeys, row),
			),
		);
	};
	const createDue = (reminder: unknown) =>
		run<{ id: string }>("task.create", {
			information: "File taxes",
			schedule: { kind: "due", at: due() },
			reminder,
		});

	it("is created with the task, linked to it, at its deadline", async () => {
		const { id } = await createDue("escalating");
		const [reminder] = await taskReminders();
		expect(reminder).toMatchObject({
			message: "File taxes",
			target: due(),
		});
		expect(reminder.escalation).not.toBeNull();
		expect(reminder.nextFireAt).toBe(
			nextFireAfter(due(), reminder.escalation, clock),
		);
		expect(
			await db.links
				.filter((link) => link.fromId === reminder.id)
				.toArray(),
		).toMatchObject([{ toId: id }]);
	});

	it("is refused for a task without a deadline", async () => {
		expect(
			await dispatch("task.create", {
				information: "Someday",
				schedule: { kind: "anytime" },
				reminder: "normal",
			}),
		).toMatchObject({ ok: false, error: { code: "invalid-input" } });
		expect(await db.tasks.count()).toBe(0);
	});

	it("follows the task's text, deadline and kind, and goes when asked", async () => {
		const { id } = await createDue("normal");
		const later = at(`2026-03-20T08:00[${NY}]`);
		await run("task.update", {
			id,
			information: "File the taxes",
			schedule: { kind: "due", at: later },
		});
		expect(await taskReminders()).toMatchObject([
			{
				message: "File the taxes",
				target: later,
				escalation: null,
				nextFireAt: later,
			},
		]);
		await run("task.update", { id, reminder: "escalating" });
		const [escalating] = await taskReminders();
		expect(escalating.escalation).not.toBeNull();
		await run("task.update", { id, reminder: null });
		expect(await taskReminders()).toEqual([]);
		expect(await db.links.count()).toBe(0);
	});

	it("goes when the task loses its deadline", async () => {
		const { id } = await createDue("normal");
		await run("task.update", { id, schedule: { kind: "anytime" } });
		expect(await taskReminders()).toEqual([]);
	});

	it("goes quiet when the task is done and comes back when reopened", async () => {
		const { id } = await createDue("normal");
		await run("task.complete", { id });
		expect(await taskReminders()).toMatchObject([{ nextFireAt: 0 }]);
		await run("task.reopen", { id });
		expect(await taskReminders()).toMatchObject([{ nextFireAt: due() }]);
	});

	it("moves on with a recurring task", async () => {
		const { id } = await run<{ id: string }>("task.create", {
			information: "Stand-up",
			schedule: { kind: "recurring", rule: daily },
			reminder: "normal",
		});
		expect(await taskReminders()).toMatchObject([
			{ target: at(`2026-03-08T09:00[${NY}]`) },
		]);
		await run("task.complete", { id });
		expect(await taskReminders()).toMatchObject([
			{
				target: at(`2026-03-09T09:00[${NY}]`),
				nextFireAt: at(`2026-03-09T09:00[${NY}]`),
			},
		]);
	});

	it("is deleted with the task", async () => {
		const { id } = await createDue("normal");
		await run("task.delete", { id });
		expect(await db.reminders.count()).toBe(0);
		expect(await db.links.count()).toBe(0);
	});
});

describe("reminders", () => {
	it("fires a normal reminder once, at its target", async () => {
		const target = clock + 60 * MINUTE;
		await run("reminder.create", { message: "Call Bo", target });
		const [reminder] = await listReminders(db, await keys());
		expect(reminder).toMatchObject({
			message: "Call Bo",
			nextFireAt: target,
			escalation: null,
		});
		expect(nextFireAfter(target, null, target)).toBe(0);
	});

	it("escalates from the moment it is set", async () => {
		const target = clock + 4 * 60 * MINUTE;
		await run("reminder.create", {
			message: "Leave",
			target,
			escalate: true,
		});
		const [reminder] = await listReminders(db, await keys());
		expect(reminder.nextFireAt).toBe(clock + 2 * 60 * MINUTE);
		expect(reminder.escalation).toEqual({ escalate: true, stopBefore: 15 });
	});

	it("restarts the schedule when the target changes, not when the text does", async () => {
		const target = clock + 60 * MINUTE;
		const { id } = await run<{ id: string }>("reminder.create", {
			message: "A",
			target,
		});
		await db.reminders.update(id, { lastFiredAt: clock });
		await run("reminder.update", { id, message: "B" });
		expect((await db.reminders.get(id))?.lastFiredAt).toBe(clock);

		const later = clock + 120 * MINUTE;
		await run("reminder.update", { id, target: later });
		const row = await db.reminders.get(id);
		expect(row).toMatchObject({
			target: later,
			nextFireAt: later,
			lastFiredAt: 0,
		});
		expect((await listReminders(db, await keys()))[0].message).toBe("B");
	});

	it("refuses past targets and empty messages", async () => {
		expect(
			await dispatch("reminder.create", {
				message: "x",
				target: clock - 1,
			}),
		).toMatchObject({ ok: false, error: { code: "rejected" } });
		expect(
			await dispatch("reminder.create", {
				message: " ",
				target: clock + 1,
			}),
		).toMatchObject({ ok: false, error: { code: "invalid-input" } });
		expect(await db.reminders.count()).toBe(0);
	});

	it("is refused while locked", async () => {
		await run("profile.lock", null);
		expect(
			await dispatch("reminder.create", {
				message: "x",
				target: clock + MINUTE,
			}),
		).toMatchObject({ ok: false, error: { code: "locked" } });
	});

	it("deletes, and deleting again is a no-op", async () => {
		const { id } = await run<{ id: string }>("reminder.create", {
			message: "x",
			target: clock + MINUTE,
		});
		await run("reminder.delete", { id });
		await run("reminder.delete", { id });
		expect(await db.reminders.count()).toBe(0);
	});
});
