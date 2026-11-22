import { LTOAST_TYPE } from "little-shared/enums";
import { useEffect, useRef, useState } from "react";
import type { Reminder } from "../../storage/repositories";
import {
	notificationsAllowed,
	takeRefused,
} from "../../services/refusedNotices";
import { createToast } from "../../services/toasts";

// Reminders fire as notifications. When Chrome will not show them, the
// reminder still counts as fired (scheduler.ts), so the popup is where the
// user finds out.

const MESSAGE_LENGTH = 60;

const quote = (message: string) =>
	message.length > MESSAGE_LENGTH
		? `${message.slice(0, MESSAGE_LENGTH - 1)}…`
		: message;

// False while Chrome has notifications turned off for Little Later.
export const useNotificationsAllowed = (): boolean => {
	const [allowed, setAllowed] = useState(true);
	useEffect(() => {
		let live = true;
		void notificationsAllowed().then((next) => {
			if (live) setAllowed(next);
		});
		const events =
			typeof chrome !== "undefined"
				? chrome.notifications?.onPermissionLevelChanged
				: undefined;
		const onChange = (level: string) => setAllowed(level !== "denied");
		events?.addListener(onChange);
		return () => {
			live = false;
			events?.removeListener(onChange);
		};
	}, []);
	return allowed;
};

// Tells the user, once each, about reminders Chrome refused to show: those
// refused before the popup opened, and any refused while it is open.
export const useRefusedReminderToasts = (
	profileId: string | undefined,
	reminders: ReadonlyArray<Reminder> | undefined,
): void => {
	const ready = profileId !== undefined && reminders !== undefined;
	// Read when a notice is told, so the latest list names it.
	const remindersRef = useRef(reminders);
	useEffect(() => {
		remindersRef.current = reminders;
	}, [reminders]);
	useEffect(() => {
		if (!ready || profileId === undefined) return;
		let live = true;
		const tell = async () => {
			for (const notice of await takeRefused(profileId)) {
				if (!live) return;
				const message =
					notice.reminderId === null
						? `Chrome didn't show ${notice.count} reminders missed while the browser was closed.`
						: (() => {
								const reminder = remindersRef.current?.find(
									({ id }) => id === notice.reminderId,
								);
								return reminder
									? `Chrome didn't show the reminder "${quote(reminder.message)}".`
									: "Chrome didn't show a reminder.";
							})();
				await createToast(message, LTOAST_TYPE.WARNING);
			}
		};
		void tell();
		const area =
			typeof chrome !== "undefined" ? chrome.storage?.session : undefined;
		const onChanged = (changes: {
			[key: string]: chrome.storage.StorageChange;
		}) => {
			if (
				Object.entries(changes).some(
					([key, change]) =>
						key.startsWith("refused:") &&
						change.newValue !== undefined,
				)
			) {
				void tell();
			}
		};
		area?.onChanged.addListener(onChanged);
		return () => {
			live = false;
			area?.onChanged.removeListener(onChanged);
		};
	}, [ready, profileId]);
};
