import Dexie from "dexie";
import { importProfileKeys, type ProfileKeys } from "../storage/keys";
import { openReminder, openSave } from "../storage/repositories";
import type { LittleDB, ReminderRow } from "../storage/schema";
import type { SessionStore } from "../storage/session";
import { nextFireAfter } from "./commands/reminders";
import type { Dispatch, SerialQueue } from "./commands/registry";

// Fires reminders from their plain schedule (decisions 0010, 0011), for
// every profile and whether or not it is unlocked. One Chrome alarm stands
// for the earliest next fire and is re-armed after each run.

export const REMINDER_ALARM = "little/reminders";
export const LOCKED_REMINDER_TEXT = "Unlock Little Later to see this reminder";

const REMINDER_NOTICE = "little/reminder::";
const AWAY_NOTICE = "little/away::";

// A fire later than this was missed (browser closed, device asleep) rather
// than delivered by its alarm.
export const MISSED_AFTER = 5 * 60_000;

export type ReminderSchedulerDeps = {
	db: LittleDB;
	session: SessionStore;
	now: () => number;
	// The worker's write queue, shared with commands (0012).
	queue: SerialQueue;
	// Arms the alarm for an instant, or clears it when nothing is pending.
	setAlarm: (when: number | null) => Promise<void>;
	notify: (id: string, message: string) => Promise<void>;
};

export type SchedulerRun = { fired: number; nextAlarm: number | null };

// Re-arms after every successful command. Reminder, task, import and
// delete commands all write reminders, and the alarm is read back from the
// table, so no list of command names can fall behind them.
export const rearmAfterCommands =
	(dispatch: Dispatch, rearm: () => void): Dispatch =>
	async (name, input) => {
		const result = await dispatch(name, input);
		if (result.ok) {
			rearm();
		}
		return result;
	};

const unlockedKeys = async (
	session: SessionStore,
): Promise<ProfileKeys | null> => {
	const unlocked = await session.get();
	return unlocked ? importProfileKeys(unlocked) : null;
};

// The text a reminder shows: its message when its profile is unlocked,
// otherwise nothing of its content.
const reminderText = async (
	keys: ProfileKeys | null,
	row: ReminderRow,
): Promise<string> => {
	if (keys?.profileId !== row.profileId) {
		return LOCKED_REMINDER_TEXT;
	}
	return (await openReminder(keys, row)).message;
};

export const createReminderScheduler = (deps: ReminderSchedulerDeps) => {
	const { db, session, queue } = deps;

	const dueRows = async (profileId: string, now: number) =>
		db.reminders
			.where("[profileId+nextFireAt]")
			.between([profileId, 1], [profileId, now], true, true)
			.toArray();

	const nextFire = async (profileIds: ReadonlyArray<string>) => {
		let earliest: number | null = null;
		for (const profileId of profileIds) {
			const row = await db.reminders
				.where("[profileId+nextFireAt]")
				.between([profileId, 1], [profileId, Dexie.maxKey])
				.first();
			if (row && (earliest === null || row.nextFireAt < earliest)) {
				earliest = row.nextFireAt;
			}
		}
		return earliest;
	};

	const fire = async (): Promise<SchedulerRun> => {
		const now = deps.now();
		const profileIds = (await db.profiles.toArray()).map(({ id }) => id);
		const due: Array<ReminderRow> = [];
		for (const profileId of profileIds) {
			due.push(...(await dueRows(profileId, now)));
		}
		// Advance first: a crash before the notices costs a notice, never a
		// repeat of every notice at each later alarm.
		await db.transaction("rw", db.reminders, async () => {
			for (const row of due) {
				await db.reminders.update(row.id, {
					lastFiredAt: now,
					nextFireAt: nextFireAfter(row.target, row.escalation, now),
				});
			}
		});
		const nextAlarm = await nextFire(profileIds);
		await deps.setAlarm(nextAlarm);

		const missed = due.filter((row) => now - row.nextFireAt > MISSED_AFTER);
		// Several missed fires collapse into one notice (0011, Catch-up).
		const collapsed = missed.length > 1 ? new Set(missed) : new Set();
		const keys = await unlockedKeys(session);
		const notices = due
			.filter((row) => !collapsed.has(row))
			.map(
				(row) => async () =>
					deps.notify(
						`${REMINDER_NOTICE}${row.id}`,
						await reminderText(keys, row),
					),
			);
		if (collapsed.size > 0) {
			notices.push(() =>
				deps.notify(
					`${AWAY_NOTICE}${now}`,
					`${collapsed.size} reminders while you were away`,
				),
			);
		}
		// One notice that cannot be shown must not hide the others.
		for (const notice of notices) {
			try {
				await notice();
			} catch (error) {
				console.error("Could not show a reminder.", error);
			}
		}
		return { fired: due.length, nextAlarm };
	};

	return {
		// Fires what is due and re-arms the alarm. Safe to call at any time:
		// at worker start, on the alarm, and after a reminder changes.
		run: (): Promise<SchedulerRun> => queue(fire),
		// The page a reminder notice opens: its attached save, when the
		// reminder's profile is unlocked. Otherwise null, for the popup.
		noticeTarget: async (
			notificationId: string,
		): Promise<string | null> => {
			if (!notificationId.startsWith(REMINDER_NOTICE)) {
				return null;
			}
			const keys = await unlockedKeys(session);
			const row = await db.reminders.get(
				notificationId.slice(REMINDER_NOTICE.length),
			);
			if (!keys || !row || row.profileId !== keys.profileId) {
				return null;
			}
			const link = await db.links
				.where("[profileId+fromId]")
				.equals([keys.profileId, row.id])
				.first();
			const save = link ? await db.saves.get(link.toId) : undefined;
			return save ? (await openSave(keys, save)).url : null;
		},
	};
};

export type ReminderScheduler = ReturnType<typeof createReminderScheduler>;

export const isLittleNotice = (notificationId: string): boolean =>
	notificationId.startsWith(REMINDER_NOTICE) ||
	notificationId.startsWith(AWAY_NOTICE);
