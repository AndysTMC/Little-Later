import type { RefusedNotice } from "../background/scheduler";

// Reminders Chrome refused to show (scheduler.ts, RefusedNotice). The
// worker records each under its own key, so a record and the popup taking
// another never overwrite each other; the popup tells the user and takes
// them. They hold ids and times, no reminder text, and live in session
// storage: memory only, gone when the browser closes.

const PREFIX = "refused:";
// More than this many unseen is a pattern the banner already explains.
const KEEP = 20;

const sessionArea = () =>
	typeof chrome !== "undefined" ? chrome.storage?.session : undefined;

export const recordRefused = async (notice: RefusedNotice): Promise<void> => {
	const area = sessionArea();
	if (!area) return;
	const keys = (await area.getKeys())
		.filter((key) => key.startsWith(PREFIX))
		.sort();
	if (keys.length >= KEEP) {
		await area.remove(keys.slice(0, keys.length - KEEP + 1));
	}
	// Keys sort by time, so the oldest go first.
	const key = `${PREFIX}${String(notice.at).padStart(16, "0")}:${crypto.randomUUID()}`;
	await area.set({ [key]: notice });
};

// The refused notices this profile should hear about: its own reminders,
// and collapsed notices, which belong to no one profile. They are removed
// as they are taken, so each is told once.
export const takeRefused = async (
	profileId: string,
): Promise<Array<RefusedNotice>> => {
	const area = sessionArea();
	if (!area) return [];
	const keys = (await area.getKeys()).filter((key) => key.startsWith(PREFIX));
	if (keys.length === 0) return [];
	const stored = (await area.get(keys)) as Record<string, RefusedNotice>;
	const mine = Object.entries(stored)
		.filter(
			([, notice]) =>
				notice.profileId === null || notice.profileId === profileId,
		)
		.sort(([a], [b]) => a.localeCompare(b));
	await area.remove(mine.map(([key]) => key));
	return mine.map(([, notice]) => notice);
};

// Whether Chrome lets Little Later show notifications at all. The system
// can still hide them (focus modes, the OS's own settings), which Chrome
// does not report here; a refused notice reaches takeRefused instead.
export const notificationsAllowed = async (): Promise<boolean> => {
	if (typeof chrome === "undefined" || !chrome.notifications) return true;
	const level = await new Promise<string>((resolve) =>
		chrome.notifications.getPermissionLevel(resolve),
	);
	return level !== "denied";
};
