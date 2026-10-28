// @vitest-environment node
// Node, not jsdom: see tests/storage/profiles.test.ts.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands } from "../../src/background/commands";
import { nextFireAfter } from "../../src/background/commands/reminders";
import {
	createCommandContext,
	createDispatcher,
	type CommandResult,
	type Dispatch,
} from "../../src/background/commands/registry";
import { importProfileKeys } from "../../src/storage/keys";
import { listReminders, listTasks } from "../../src/storage/repositories";
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
