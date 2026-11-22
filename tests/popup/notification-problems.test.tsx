import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A refused reminder still counts as fired, so it never repeats (decision
// on finding 13). The popup is where the user hears about it: a banner
// while Chrome has notifications off, and one toast per refused reminder.

const toasts = vi.hoisted(() => [] as Array<string>);
vi.mock("../../src/services/toasts", () => ({
	createToast: async (message: string) => {
		toasts.push(message);
	},
}));

const { recordRefused } = await import("../../src/services/refusedNotices");
const { useNotificationsAllowed, useRefusedReminderToasts } =
	await import("../../src/popup/hooks/useNotificationProblems");

let session: Map<string, unknown>;
let level: "granted" | "denied";
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	session = new Map();
	level = "granted";
	toasts.length = 0;
	vi.stubGlobal("chrome", {
		storage: {
			session: {
				getKeys: async () => [...session.keys()],
				get: async (keys: Array<string>) =>
					Object.fromEntries(
						keys
							.filter((key) => session.has(key))
							.map((key) => [key, session.get(key)]),
					),
				set: async (items: Record<string, unknown>) => {
					for (const [key, value] of Object.entries(items)) {
						session.set(key, value);
					}
				},
				remove: async (keys: Array<string>) => {
					for (const key of keys) session.delete(key);
				},
				onChanged: { addListener: () => {}, removeListener: () => {} },
			},
		},
		notifications: {
			getPermissionLevel: (callback: (level: string) => void) =>
				callback(level),
			onPermissionLevelChanged: {
				addListener: () => {},
				removeListener: () => {},
			},
		},
	});
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	vi.unstubAllGlobals();
});

const reminders = [
	{
		id: "r1",
		message: "Call Bob",
		target: 0,
		escalation: [],
		lastFiredAt: 0,
		nextFireAt: 0,
	},
] as unknown as Parameters<typeof useRefusedReminderToasts>[1];

const Probe = ({ profileId }: { profileId: string }) => {
	useRefusedReminderToasts(profileId, reminders);
	return <p>{useNotificationsAllowed() ? "allowed" : "off"}</p>;
};

const render = (profileId: string) =>
	act(async () => root.render(<Probe profileId={profileId} />));

describe("refused reminder notices", () => {
	it("tell this profile once each, and leave another profile's", async () => {
		await recordRefused({ profileId: "p1", reminderId: "r1", at: 1 });
		await recordRefused({ profileId: "p2", reminderId: "r9", at: 2 });
		await recordRefused({
			profileId: null,
			reminderId: null,
			count: 3,
			at: 3,
		});
		await render("p1");
		await vi.waitFor(() => expect(toasts).toHaveLength(2));
		expect(toasts).toEqual([
			'Chrome didn\'t show the reminder "Call Bob".',
			"Chrome didn't show 3 reminders missed while the browser was closed.",
		]);
		// Only p2's is left.
		expect([...session.values()]).toEqual([
			{ profileId: "p2", reminderId: "r9", at: 2 },
		]);
	});

	it("show the banner only while Chrome has notifications off", async () => {
		await render("p1");
		expect(container.textContent).toBe("allowed");
		act(() => root.unmount());
		root = createRoot(container);
		level = "denied";
		await render("p1");
		await vi.waitFor(() => expect(container.textContent).toBe("off"));
	});
});
