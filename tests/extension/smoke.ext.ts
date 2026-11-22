import { createProfile, expect, sendCommand, test } from "./fixtures";

// Proves the harness itself: the built extension loads, its real service
// worker answers the popup, and state survives the worker being stopped.
// Feature coverage lives in the other *.ext.ts files.

test("loads the built extension and shows the profile picker", async ({
	serviceWorker,
	openPopup,
}) => {
	const manifest = await serviceWorker.evaluate(() =>
		chrome.runtime.getManifest(),
	);
	expect(manifest.name).toBe("Little Later");
	expect(manifest.manifest_version).toBe(3);

	const page = await openPopup("/browse-profiles");
	await expect(page.getByText("Choose Profile")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Create a new profile" }),
	).toBeVisible();
});

test("only extension pages can send commands, and a locked worker refuses writes", async ({
	openPopup,
}) => {
	const page = await openPopup("/browse-profiles");
	const result = await sendCommand(page, "note.create", { content: "x" });
	expect(result).toMatchObject({ ok: false, error: { code: "locked" } });
});

test("creates a profile through the popup and unlocks it in the worker", async ({
	serviceWorker,
	openPopup,
}) => {
	// Nothing is captured while locked, so the capture alarm does not exist.
	expect(
		await serviceWorker.evaluate(() =>
			chrome.alarms.get("captureActiveTab"),
		),
	).toBeUndefined();

	await createProfile(openPopup);

	const session = await serviceWorker.evaluate(() =>
		chrome.storage.session.get("unlocked"),
	);
	expect(session.unlocked).toMatchObject({
		profileId: expect.any(String),
	});
	await expect
		.poll(() =>
			serviceWorker.evaluate(() => chrome.alarms.get("captureActiveTab")),
		)
		.toBeDefined();
});

test("a write made by the worker appears in the open popup", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await page.getByRole("tab", { name: "Notes" }).click();

	const result = await sendCommand(page, "note.create", {
		content: "Written by the worker",
	});
	expect(result.ok).toBe(true);
	// No reload: the popup's live query sees the worker's write.
	await expect(
		page.getByRole("button", { name: /Open note: Written by the worker/ }),
	).toBeVisible();
});

test("the profile stays unlocked and usable after the worker is stopped", async ({
	openPopup,
	stopServiceWorker,
	currentServiceWorker,
}) => {
	const page = await createProfile(openPopup);
	await page.getByRole("tab", { name: "Notes" }).click();

	await stopServiceWorker();

	// The command wakes a fresh worker, which must find the session keys in
	// chrome.storage.session rather than in memory.
	const result = await sendCommand(page, "note.create", {
		content: "After a restart",
	});
	expect(result.ok).toBe(true);
	await expect(
		page.getByRole("button", { name: /Open note: After a restart/ }),
	).toBeVisible();

	const worker = await currentServiceWorker();
	const session = await worker.evaluate(() =>
		chrome.storage.session.get("unlocked"),
	);
	expect(session.unlocked).toBeDefined();
});
