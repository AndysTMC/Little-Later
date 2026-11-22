import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { createProfile, expect, sendCommand, test } from "./fixtures";
import {
	button,
	command,
	lock,
	rows,
	seedReminder,
	tab,
	upload,
} from "./support";

const count = (page: Page, table: string) =>
	page.evaluate(
		(name) =>
			new Promise<number>((resolve, reject) => {
				const open = indexedDB.open("little");
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const transaction = db.transaction(name);
					const request = transaction.objectStore(name).count();
					transaction.oncomplete = () => db.close();
					request.onerror = () => reject(request.error);
					request.onsuccess = () => resolve(request.result);
				};
			}),
		table,
	);

type Session = { unlocked?: { profileId: string } };

test("a worker restart restores the unlocked session and both alarm states", async ({
	openPopup,
	stopServiceWorker,
	currentServiceWorker,
	serviceWorker,
}) => {
	const page = await createProfile(openPopup);
	await tab(page, "Notes").click();
	const target = Date.now() + 3_600_000;
	await seedReminder(page, "Keep this alarm", target);
	const alarms = (worker: typeof serviceWorker) =>
		worker.evaluate(async () => ({
			capture: (await chrome.alarms.get("captureActiveTab"))
				?.periodInMinutes,
			reminder: (await chrome.alarms.get("little/reminders"))
				?.scheduledTime,
		}));
	const initial = await serviceWorker.evaluate(
		async () =>
			(await chrome.storage.session.get<Session>("unlocked")).unlocked
				?.profileId,
	);
	await expect
		.poll(() => alarms(serviceWorker))
		.toEqual({ capture: 0.5, reminder: target });
	await stopServiceWorker();
	await command(page, "note.create", { content: "Written after stop" });
	await expect(button(page, "Open note: Written after stop")).toBeVisible();
	const restarted = await currentServiceWorker();
	expect(
		await restarted.evaluate(
			async () =>
				(await chrome.storage.session.get<Session>("unlocked")).unlocked
					?.profileId,
		),
	).toBe(initial);
	await expect
		.poll(() => alarms(restarted))
		.toEqual({ capture: 0.5, reminder: target });

	await lock(page);
	await expect
		.poll(() => alarms(restarted))
		.toEqual({ capture: undefined, reminder: target });
	await stopServiceWorker();
	const locked = await currentServiceWorker();
	await expect
		.poll(() => alarms(locked))
		.toEqual({ capture: undefined, reminder: target });
	expect(
		await sendCommand(page, "note.create", { content: "Must be refused" }),
	).toMatchObject({ ok: false, error: { code: "locked" } });
});

test("stopping the worker after a nonfinal backup chunk cleans up its partial rows", async ({
	openPopup,
	stopServiceWorker,
	currentServiceWorker,
}) => {
	const page = await createProfile(openPopup);
	const noteCount = 24;
	// Export enough genuine notes to force a second chunk, while keeping
	// the imported records small in total and the handoff deterministic.
	await page.evaluate(async (count) => {
		for (let index = 0; index < count; index++) {
			const result = await chrome.runtime.sendMessage({
				type: "little/command",
				name: "note.create",
				input: { content: "Note " + index + " " + "x".repeat(95_000) },
			});
			if (!result?.ok)
				throw new Error(
					"Could not create backup fixture note " + index,
				);
		}
	}, noteCount);
	await page.goto(page.url().split("#")[0] + "#/export");
	const password = "partial backup password";
	await page.getByPlaceholder("Backup password").fill(password);
	const download = page.waitForEvent("download");
	await button(page, "Export").click();
	const file = await download;
	const buffer = await readFile(await file.path());
	await button(page, "Go back").click();
	await button(page, "Go back").click();
	await lock(page);
	await button(page, "Import a profile").click();
	await button(page, "Upload a backup file").click();
	await upload(page, [
		{
			name: file.suggestedFilename(),
			mimeType: "application/octet-stream",
			buffer,
		},
	]);
	await expect(page).toHaveURL(/#\/import-profile$/);
	const backupHandoff = await page.evaluateHandle(() => {
		const send = chrome.runtime.sendMessage.bind(chrome.runtime);
		const state = { nextBlocked: false, release: () => {} };
		let firstWasPartial = false;
		const nextMayStart = new Promise<void>((resolve) => {
			state.release = resolve;
		});
		chrome.runtime.sendMessage = (async (message: { name?: string }) => {
			if (message.name !== "backup.importChunk") return send(message);
			if (firstWasPartial) {
				state.nextBlocked = true;
				await nextMayStart;
			}
			const reply = await send(message);
			firstWasPartial = reply?.ok === true && reply.value?.done === false;
			return reply;
		}) as typeof chrome.runtime.sendMessage;
		return state;
	});
	await page.getByLabel("Backup password").fill(password);
	await button(page, "Import").click();
	await expect
		.poll(() => backupHandoff.evaluate((state) => state.nextBlocked))
		.toBe(true);
	expect(await count(page, "notes")).toBeGreaterThan(noteCount);
	expect(await count(page, "jobs")).toBe(1);
	expect(await count(page, "profiles")).toBe(1);

	await stopServiceWorker();
	await currentServiceWorker();
	await expect.poll(() => count(page, "jobs")).toBe(0);
	expect(await count(page, "notes")).toBe(noteCount);
	expect(await count(page, "profiles")).toBe(1);
	await backupHandoff.evaluate((state) => state.release());
	await expect(page.getByRole("alert")).toContainText(
		"The import was interrupted. Try again.",
	);
	expect(await count(page, "profiles")).toBe(1);
});

test("observe whether a command overlapping worker shutdown receives a reply", async ({
	openPopup,
	stopServiceWorker,
	currentServiceWorker,
}, testInfo) => {
	const page = await createProfile(openPopup);
	let outcome = "no reply within two seconds";
	await stopServiceWorker(async () => {
		await page.evaluate(() => {
			const attempt = { outcome: "pending" };
			Object.defineProperty(window, "__workerStopAttempt", {
				value: attempt,
			});
			void chrome.runtime
				.sendMessage({
					type: "little/command",
					name: "note.create",
					input: { content: "Message overlapping worker stop" },
				})
				.then(
					(reply) => {
						attempt.outcome = reply?.ok
							? "success"
							: "non-success reply";
					},
					(error: Error) => {
						attempt.outcome = "rejected: " + error.message;
					},
				);
		});
	});
	try {
		await expect
			.poll(
				async () => {
					const status = await page.evaluate(
						() =>
							(
								window as unknown as {
									__workerStopAttempt: { outcome: string };
								}
							).__workerStopAttempt.outcome,
					);
					if (status !== "pending") outcome = status;
					return status;
				},
				{ timeout: 2_000 },
			)
			.not.toBe("pending");
	} catch (error) {
		if (outcome !== "no reply within two seconds") throw error;
	}
	await currentServiceWorker();
	const observedRows = (await rows(page, "notes")).length;
	expect(observedRows).toBeLessThanOrEqual(1);
	if (outcome === "success") expect(observedRows).toBe(1);
	const detail = { outcome, observedRows };
	await testInfo.attach("worker-stop-observation", {
		body: JSON.stringify(detail),
		contentType: "application/json",
	});
	console.log("Worker shutdown sample:", JSON.stringify(detail));
});
