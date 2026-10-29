// @vitest-environment node
// Node, not jsdom: see tests/storage/profiles.test.ts.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands } from "../../src/background/commands";
import {
	createCommandContext,
	createDispatcher,
	createSerialQueue,
	type CommandResult,
	type Dispatch,
	type SerialQueue,
} from "../../src/background/commands/registry";
import {
	LOCKED_REMINDER_TEXT,
	MISSED_AFTER,
	createReminderScheduler,
	isLittleNotice,
	rearmAfterCommands,
	type ReminderScheduler,
} from "../../src/background/scheduler";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import {
	createMemorySessionStore,
	type SessionStore,
} from "../../src/storage/session";

const MINUTE = 60_000;
const START = Date.UTC(2026, 2, 7, 12);

let db: LittleDB;
let session: SessionStore;
let clock: number;
let zone: string;
let dispatch: Dispatch;
let queue: SerialQueue;
let scheduler: ReminderScheduler;
let alarm: number | null | undefined;
let notices: Array<{ id: string; message: string }>;
let failNotice: ((id: string) => boolean) | null;

const run = async <T>(name: string, input: unknown): Promise<T> => {
	const result: CommandResult<unknown> = await dispatch(name, input);
	if (!result.ok)
		throw new Error(`${result.error.code}: ${result.error.message}`);
	return result.value as T;
};

const remind = (message: string, target: number, extra = {}) =>
	run<{ id: string }>("reminder.create", { message, target, ...extra });

const messages = () => notices.map(({ message }) => message);

beforeEach(async () => {
	db = openLittleDB(`little-test-${crypto.randomUUID()}`);
	await db.open();
	session = createMemorySessionStore();
	clock = START;
	zone = "UTC";
	alarm = undefined;
	notices = [];
	failNotice = null;
	queue = createSerialQueue();
	dispatch = createDispatcher(
		commands,
		createCommandContext(
			db,
			session,
			() => clock,
			() => zone,
		),
		queue,
	);
	scheduler = createReminderScheduler({
		db,
		session,
		now: () => clock,
		zone: () => zone,
		queue,
		setAlarm: async (when) => {
			alarm = when;
		},
		notify: async (id, message) => {
			if (failNotice?.(id)) throw new Error("Notification refused.");
			notices.push({ id, message });
		},
	});
	await run("profile.create", { name: "Ada", password: null });
});

afterEach(async () => {
	await db.delete();
});

describe("re-arming after commands", () => {
	// Task commands and imports write reminders too. A list of reminder
	// commands missed them, so a task's reminder never armed the alarm.
	it("follows a reminder that a task command wrote", async () => {
		const send = rearmAfterCommands(dispatch, () => void scheduler.run());
		const due = START + 30 * MINUTE;
		const created = await send("task.create", {
			information: "Pay rent",
			schedule: { kind: "due", at: due },
			reminder: "normal",
		});
		expect(created.ok).toBe(true);
		// The run queues behind the command.
		await queue(async () => {});
		expect(alarm).toBe(due);

		const { id } = (created as { value: { id: string } }).value;
		await send("task.delete", { id });
		await queue(async () => {});
		expect(alarm).toBeNull();
	});

	// 0011: a floating 09:00 follows the device to another zone.
	it("moves a floating task's reminder when the device changes zone", async () => {
		await run("task.create", {
			information: "Stand-up",
			schedule: {
				kind: "recurring",
				rule: {
					freq: "daily",
					interval: 1,
					time: "09:00",
					anchor: "2026-03-01",
					zone: "floating",
				},
			},
			reminder: "normal",
		});
		expect((await scheduler.run()).nextAlarm).toBe(Date.UTC(2026, 2, 8, 9));
		zone = "Asia/Kolkata";
		expect((await scheduler.run()).nextAlarm).toBe(
			Date.UTC(2026, 2, 8, 3, 30),
		);
	});

	it("leaves the alarm alone after a refused command", async () => {
		const runs: Array<true> = [];
		const send = rearmAfterCommands(dispatch, () => runs.push(true));
		await send("task.update", { id: "missing" });
		expect(runs).toEqual([]);
	});
});

describe("reminder scheduler", () => {
	it("arms one alarm for the earliest fire and fires on time", async () => {
		await remind("Later", START + 60 * MINUTE);
		const { id } = await remind("Sooner", START + 10 * MINUTE);

		expect(await scheduler.run()).toEqual({
			fired: 0,
			nextAlarm: START + 10 * MINUTE,
		});
		expect(alarm).toBe(START + 10 * MINUTE);

		clock = START + 10 * MINUTE;
		expect(await scheduler.run()).toEqual({
			fired: 1,
			nextAlarm: START + 60 * MINUTE,
		});
		expect(notices).toEqual([
			{ id: `little/reminder::${id}`, message: "Sooner" },
		]);
		const row = await db.reminders.get(id);
		expect(row?.lastFiredAt).toBe(clock);
		expect(row?.nextFireAt).toBe(0);

		// Nothing fires twice.
		await scheduler.run();
		expect(notices).toHaveLength(1);
	});

	it("clears the alarm when nothing is left to fire", async () => {
		await remind("Once", START + 10 * MINUTE);
		clock = START + 10 * MINUTE;
		expect((await scheduler.run()).nextAlarm).toBeNull();
		expect(alarm).toBeNull();
	});

	it("walks an escalating reminder to its target", async () => {
		// Gaps halve: 64, 32, 16 minutes; then, within 15 minutes of the
		// target, the target itself.
		const target = START + 128 * MINUTE;
		await remind("Call back", target, { escalate: true });
		const fires: Array<number> = [];
		for (let step = 0; step < 10; step++) {
			const { nextAlarm } = await scheduler.run();
			if (nextAlarm === null) break;
			clock = nextAlarm;
			fires.push(clock);
		}
		expect(fires).toEqual([
			START + 64 * MINUTE,
			START + 96 * MINUTE,
			START + 112 * MINUTE,
			target,
		]);
		expect(messages()).toEqual(Array(4).fill("Call back"));
	});

	it("shows generic text while locked, and keeps firing", async () => {
		await remind("Secret plan", START + 10 * MINUTE);
		await run("profile.lock", {});
		clock = START + 10 * MINUTE;
		await scheduler.run();
		expect(messages()).toEqual([LOCKED_REMINDER_TEXT]);
	});

	it("hides another profile's reminders while one is unlocked", async () => {
		await remind("Ada's", START + 10 * MINUTE);
		await run("profile.create", { name: "Grace", password: null });
		await remind("Grace's", START + 10 * MINUTE);
		clock = START + 10 * MINUTE;
		await scheduler.run();
		expect(messages().sort()).toEqual(
			["Grace's", LOCKED_REMINDER_TEXT].sort(),
		);
	});

	it("collapses several missed fires into one notice", async () => {
		await remind("One", START + 10 * MINUTE);
		await remind("Two", START + 20 * MINUTE);
		await remind("Three", START + 30 * MINUTE, { escalate: true });
		// The browser was closed for a day.
		clock = START + 24 * 60 * MINUTE;
		expect((await scheduler.run()).fired).toBe(3);
		expect(notices).toEqual([
			{
				id: `little/away::${clock}`,
				message: "3 reminders while you were away",
			},
		]);
		expect(isLittleNotice(notices[0].id)).toBe(true);
		expect(alarm).toBeNull();
	});

	it("shows a single missed fire as itself, beside on-time ones", async () => {
		await remind("Missed", START + 10 * MINUTE);
		await remind("On time", START + 30 * MINUTE);
		clock = START + 30 * MINUTE;
		expect(START + 30 * MINUTE - (START + 10 * MINUTE)).toBeGreaterThan(
			MISSED_AFTER,
		);
		await scheduler.run();
		expect(messages().sort()).toEqual(["Missed", "On time"]);
	});

	it("keeps showing notices after one is refused", async () => {
		const { id } = await remind("Refused", START + 10 * MINUTE);
		await remind("Shown", START + 10 * MINUTE);
		failNotice = (notice) => notice.endsWith(id);
		clock = START + 10 * MINUTE;
		expect((await scheduler.run()).fired).toBe(2);
		expect(messages()).toEqual(["Shown"]);
		expect((await db.reminders.get(id))?.nextFireAt).toBe(0);
	});

	it("follows a rescheduled reminder", async () => {
		const { id } = await remind("Moved", START + 10 * MINUTE);
		await run("reminder.update", { id, target: START + 40 * MINUTE });
		expect((await scheduler.run()).nextAlarm).toBe(START + 40 * MINUTE);
		await run("reminder.delete", { id });
		expect((await scheduler.run()).nextAlarm).toBeNull();
	});

	it("opens the attached save only while its profile is unlocked", async () => {
		const { id: saveId } = await run<{ id: string }>("save.capture", {
			url: "https://example.com/read",
			title: "Read me",
			saved: true,
		});
		const { id } = await remind("Read it", START + 10 * MINUTE, {
			saveId,
		});
		const { id: plain } = await remind("No page", START + 10 * MINUTE);
		const notice = `little/reminder::${id}`;
		expect(await scheduler.noticeTarget(notice)).toBe(
			"https://example.com/read",
		);
		expect(
			await scheduler.noticeTarget(`little/reminder::${plain}`),
		).toBeNull();
		expect(await scheduler.noticeTarget("taskReminder1::x")).toBeNull();
		await run("profile.lock", {});
		expect(await scheduler.noticeTarget(notice)).toBeNull();
	});

	it("runs in the command queue, never between a command's steps", async () => {
		const { id } = await remind("Queued", START + 10 * MINUTE);
		clock = START + 10 * MINUTE;
		const order: Array<string> = [];
		const update = dispatch("reminder.update", {
			id,
			target: START + 50 * MINUTE,
		}).then(() => order.push("update"));
		const fire = scheduler.run().then((result) => {
			order.push("fire");
			return result;
		});
		await Promise.all([update, fire]);
		expect(order).toEqual(["update", "fire"]);
		// The update moved the reminder before the scheduler looked.
		expect((await fire).fired).toBe(0);
		expect((await db.reminders.get(id))?.nextFireAt).toBeGreaterThan(clock);
	});
});

describe("serial queue", () => {
	it("keeps running tasks after one fails", async () => {
		queue = createSerialQueue();
		const failed = queue(async () => {
			throw new Error("boom");
		});
		const next = queue(async () => "ran");
		await expect(failed).rejects.toThrow("boom");
		expect(await next).toBe("ran");
	});
});
