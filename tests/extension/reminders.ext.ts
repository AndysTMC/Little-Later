import { createProfile, expect, test } from "./fixtures";
import { button, lock, rows, seedReminder, tab } from "./support";

for (const locked of [false, true]) {
	test(
		"a due reminder fires " +
			(locked
				? "with generic text while locked"
				: "with its message and moves to Past"),
		async ({ openPopup, serviceWorker }) => {
			const page = await createProfile(
				openPopup,
				"Reminder sample",
				"sample protection password",
			);
			// getAll exposes IDs only. Observe the options sent to Chrome and
			// forward the real API call, then verify Chrome registered the ID.
			const sent = await serviceWorker.evaluateHandle(() => {
				const messages: Record<string, string> = {};
				const create = chrome.notifications.create.bind(
					chrome.notifications,
				);
				chrome.notifications.create = ((
					id: string,
					options: chrome.notifications.NotificationCreateOptions,
					done: (id: string) => void,
				) => {
					messages[id] = options.message ?? "";
					return create(id, options, done);
				}) as typeof chrome.notifications.create;
				return messages;
			});
			const target = Date.now() + (locked ? 7_000 : 4_000);
			const { id } = await seedReminder(
				page,
				"Private watering reminder",
				target,
			);
			const notificationId = "little/reminder::" + id;
			await expect
				.poll(() =>
					serviceWorker.evaluate(
						async () =>
							(await chrome.alarms.get("little/reminders"))
								?.scheduledTime,
					),
				)
				.toBe(target);
			if (locked) {
				await lock(page);
			} else {
				await tab(page, "Reminders").click();
				await expect(
					page.getByText("Upcoming", { exact: true }),
				).toBeVisible();
			}
			await expect
				.poll(
					() =>
						serviceWorker.evaluate(() =>
							chrome.notifications.getAll(),
						),
					{ timeout: 16_000 },
				)
				.toHaveProperty(notificationId, true);
			expect(
				await sent.evaluate(
					(messages, key) => messages[key],
					notificationId,
				),
			).toBe(
				locked
					? "Unlock Little Later to see this reminder"
					: "Private watering reminder",
			);
			await expect
				.poll(() => rows(page, "reminders"))
				.toMatchObject([{ id, nextFireAt: 0 }]);
			if (!locked) {
				await expect(
					page.getByText("Past", { exact: true }),
				).toBeVisible();
				await expect(
					page.getByText("Upcoming", { exact: true }),
				).toHaveCount(0);
				await button(page, "Details").click();
				await expect(
					page.getByText("Private watering reminder"),
				).toBeVisible();
			}
		},
	);
}
