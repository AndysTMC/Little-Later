import type { SerialQueue } from "./commands/registry";
import type { LittleDB } from "../storage/schema";
import type { SessionStore } from "../storage/session";

// Automatic lock (decision 0010, Locking): the unlocked profile locks when
// the screen locks, and after its configured idle minutes. Browser start and
// extension updates lock it too, because Chrome clears session storage then.

export type IdleApi = {
	setDetectionInterval: (seconds: number) => void;
	onStateChanged: {
		addListener: (
			listener: (state: "active" | "idle" | "locked") => void,
		) => void;
	};
};

// Chrome refuses detection intervals under 15 seconds.
const MIN_INTERVAL_SECONDS = 15;

export const createAutoLock = ({
	db,
	session,
	queue,
	idle,
}: {
	db: LittleDB;
	session: SessionStore;
	queue: SerialQueue;
	idle: IdleApi;
}) => {
	// Applies the unlocked profile's idle minutes; call after unlock and
	// after its preferences change.
	const configure = async (): Promise<void> => {
		const unlocked = await session.get();
		if (!unlocked) return;
		const profile = await db.profiles.get(unlocked.profileId);
		if (!profile) return;
		idle.setDetectionInterval(
			Math.max(MIN_INTERVAL_SECONDS, profile.prefs.autoLockMinutes * 60),
		);
	};

	const start = () => {
		idle.onStateChanged.addListener((state) => {
			if (state === "idle" || state === "locked") {
				// Queued, so a command already running finishes first.
				void queue(() => session.clear());
			}
		});
		session.subscribe((unlocked) => {
			if (unlocked) void configure();
		});
		void configure();
	};

	return { start, configure };
};
