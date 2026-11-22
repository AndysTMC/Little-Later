import type { Page } from "@playwright/test";
import { createProfile, expect, sendCommand, test } from "./fixtures";
import {
	button,
	command,
	openNote,
	option,
	seedReminder,
	seedSave,
	seedTask,
	tab,
	uiState,
} from "./support";

const dateInputs = (page: Page) =>
	Promise.all(
		["YYYY", "MM", "DD", "hh", "mm"].map((label) =>
			page.getByLabel(label, { exact: true }).inputValue(),
		),
	);

// The toolbar popup closes whenever it loses focus. Closing the page and
// opening the popup's start page again stands in for that.

test("a half-written task is still there after the popup closes and reopens", async ({
	openPopup,
}) => {
	const first = await createProfile(openPopup);
	await first.getByRole("button", { name: "New task" }).click();
	await first.getByPlaceholder("Information").fill("Renew the passport");
	await first.close();

	const second = await openPopup("/");
	// Back on the form, not on Home, with the text in place.
	await expect(second).toHaveURL(/#\/home\/new-task$/);
	await expect(second.getByRole("textbox").first()).toHaveValue(
		"Renew the passport",
	);
});

test("an unsaved note edit is still there after the popup closes and reopens", async ({
	openPopup,
}) => {
	const first = await createProfile(openPopup);
	await first.getByRole("button", { name: "New note" }).click();
	await first.getByLabel("Note content").fill("Ideas for the trip");
	await first.close();

	const second = await openPopup("/");
	await expect(second).toHaveURL(/#\/home\/new-note$/);
	await expect(second.getByLabel("Note content")).toHaveValue(
		"Ideas for the trip",
	);
});

test("locking forgets the page and the drafts", async ({
	openPopup,
	serviceWorker,
}) => {
	const page = await createProfile(openPopup);
	await page.getByRole("button", { name: "New task" }).click();
	await page.getByPlaceholder("Information").fill("Private errand");
	await expect
		.poll(async () => JSON.stringify(await uiState(serviceWorker)))
		.toContain("Private errand");

	expect(await sendCommand(page, "profile.lock", null)).toMatchObject({
		ok: true,
	});

	// The page is still open and moves to the profile picker; nothing it
	// writes afterwards may bring the drafts back.
	await expect(page).toHaveURL(/#\/browse-profiles$/);
	const after = await serviceWorker.evaluate(() =>
		chrome.storage.session.get(null),
	);
	expect(after.unlocked).toBeUndefined();
	expect(JSON.stringify(after)).not.toContain("Private errand");
});

test("two open pages keep each other's drafts", async ({
	openPopup,
	serviceWorker,
}) => {
	// Both pages load the remembered state before either types.
	const task = await createProfile(openPopup);
	await task.getByRole("button", { name: "New task" }).click();
	const reminder = await openPopup("/home/new-reminder");
	await task.getByPlaceholder("Information").fill("Call the bank");
	await reminder.getByPlaceholder("Message").fill("Buy stamps");
	await expect
		.poll(async () => (await uiState(serviceWorker)).drafts)
		.toMatchObject({
			"task.new.fields": { information: "Call the bank" },
			"reminder.new.message": "Buy stamps",
		});
});

test("new-profile text survives reopen but neither password field is remembered", async ({
	openPopup,
	serviceWorker,
}) => {
	const page = await openPopup("/new-profile");
	await page.getByLabel("Profile name").fill("Remembered name");
	await page
		.getByLabel("Password", { exact: true })
		.fill("private password draft");
	await page.getByLabel("Confirm password").fill("private password draft");
	expect(JSON.stringify(await uiState(serviceWorker))).not.toContain(
		"private password draft",
	);
	await page.close();
	const reopened = await openPopup("/");
	await expect(reopened).toHaveURL(/#\/new-profile$/);
	await expect(reopened.getByLabel("Profile name")).toHaveValue(
		"Remembered name",
	);
	await expect(reopened.getByLabel("Password", { exact: true })).toHaveValue(
		"",
	);
	await expect(reopened.getByLabel("Confirm password")).toHaveCount(0);
	await reopened
		.getByLabel("Password", { exact: true })
		.fill("another temporary value");
	await expect(reopened.getByLabel("Confirm password")).toHaveValue("");
});

test("a new task restores label, priority, due date and reminder, and starts empty once saved", async ({
	openPopup,
	serviceWorker,
}) => {
	const page = await createProfile(openPopup);
	await button(page, "New task").click();
	await page
		.getByPlaceholder("Information")
		.fill("Create the release checklist");
	await page.getByPlaceholder("Label").fill("Release");
	await option(page, "Priority", "High").click();
	await option(page, "Type", "Due").click();
	await expect(page.getByText("Deadline", { exact: true })).toBeVisible();
	await page.getByLabel("YYYY", { exact: true }).press("ArrowUp");
	await option(page, "Reminder", "Normal").click();
	await expect(option(page, "Reminder", "Normal")).toBeChecked();
	const when = await dateInputs(page);
	await page.close();

	const restored = await openPopup("/");
	await expect(restored).toHaveURL(/#\/home\/new-task$/);
	await expect(restored.getByPlaceholder("Information")).toHaveValue(
		"Create the release checklist",
	);
	await expect(restored.getByPlaceholder("Label")).toHaveValue("Release");
	await expect(option(restored, "Priority", "High")).toBeChecked();
	await expect(option(restored, "Type", "Due")).toBeChecked();
	await expect(option(restored, "Reminder", "Normal")).toBeChecked();
	expect(await dateInputs(restored)).toEqual(when);
	await button(restored, "Create").click();
	await expect(restored).toHaveURL(/#\/home$/);
	await expect(restored.getByRole("tablist")).toBeVisible();
	await expect
		.poll(() => uiState(serviceWorker))
		.toMatchObject({ route: { path: "/home" } });
	await restored.close();
	const next = await openPopup("/");
	await expect(next.getByRole("tablist")).toBeVisible();
	await button(next, "New task").click();
	await expect(next.getByPlaceholder("Information")).toHaveValue("");
	await expect(next.getByPlaceholder("Label")).toHaveValue("");
});

test("closing immediately after Create reopens on Home, not the form", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await button(page, "New task").click();
	await page.getByPlaceholder("Information").fill("Saved before closing");
	await button(page, "Create").click();
	await expect(page).toHaveURL(/#\/home$/);
	await page.close();

	const reopened = await openPopup("/");
	await expect(reopened.getByRole("tablist")).toBeVisible();
	await expect(reopened).toHaveURL(/#\/home$/);
});

test("a new reminder restores text, type, date and its linked save", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await seedSave(page, "Watched page");
	await button(page, "New reminder").click();
	await page.getByPlaceholder("Message").fill("Bring the forms");
	await option(page, "Type", "Escalating").click();
	await page.getByLabel("YYYY", { exact: true }).press("ArrowUp");
	await button(page, "Link a save").click();
	await button(page, /Watched page/).click();
	await expect(button(page, "Unlink save: Watched page")).toBeVisible();
	const when = await dateInputs(page);
	await page.close();

	const restored = await openPopup("/");
	await expect(restored).toHaveURL(/#\/home\/new-reminder$/);
	await expect(restored.getByPlaceholder("Message")).toHaveValue(
		"Bring the forms",
	);
	await expect(option(restored, "Type", "Escalating")).toBeChecked();
	await expect(button(restored, "Unlink save: Watched page")).toBeVisible();
	expect(await dateInputs(restored)).toEqual(when);
});

test("editing an existing task and reminder restores both routes and their edits", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	const task = await seedTask(page, "Old errand");
	const reminder = await seedReminder(page, "Old message");
	await tab(page, "Tasks").click();
	await button(page, "Edit task").click();
	await expect(page).toHaveURL(new RegExp("#/task/" + task.id + "$"));
	await page.getByPlaceholder("Information").fill("Changed errand");
	await page.getByPlaceholder("Label").fill("New task label");
	await page.close();

	const restoredTask = await openPopup("/");
	await expect(restoredTask).toHaveURL(new RegExp("#/task/" + task.id + "$"));
	await expect(restoredTask.getByPlaceholder("Information")).toHaveValue(
		"Changed errand",
	);
	await expect(restoredTask.getByPlaceholder("Label")).toHaveValue(
		"New task label",
	);
	await button(restoredTask, "Go back").click();
	await tab(restoredTask, "Reminders").click();
	await button(restoredTask, "Edit reminder").click();
	await expect(restoredTask).toHaveURL(
		new RegExp("#/reminder/" + reminder.id + "$"),
	);
	await restoredTask.getByPlaceholder("Message").fill("Changed message");
	await option(restoredTask, "Type", "Escalating").click();
	await expect(option(restoredTask, "Type", "Escalating")).toBeChecked();
	await restoredTask.close();

	const restoredReminder = await openPopup("/");
	await expect(restoredReminder).toHaveURL(
		new RegExp("#/reminder/" + reminder.id + "$"),
	);
	await expect(restoredReminder.getByPlaceholder("Message")).toHaveValue(
		"Changed message",
	);
	await expect(option(restoredReminder, "Type", "Escalating")).toBeChecked();
});

test("an existing note reopens in Edit and Home remembers its selected tab", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await command(page, "note.create", { content: "Saved note for reopening" });
	await openNote(page, "Saved note for reopening");
	const route = page.url();
	await button(page, "Edit").click();
	await page
		.getByLabel("Note content")
		.fill("Draft edit of an existing note");
	await page.close();

	const restored = await openPopup("/");
	await expect(restored).toHaveURL(route);
	await expect(restored.getByLabel("Note content")).toHaveValue(
		"Draft edit of an existing note",
	);
	await button(restored, "Go back").click();
	await tab(restored, "Tasks").click();
	await expect(tab(restored, "Tasks")).toHaveAttribute(
		"aria-selected",
		"true",
	);
	await restored.close();
	const home = await openPopup("/");
	await expect(home).toHaveURL(/#\/home$/);
	await expect(tab(home, "Tasks")).toHaveAttribute("aria-selected", "true");
});

test("an old popup route opens Home while retaining the draft", async ({
	openPopup,
	serviceWorker,
}) => {
	const page = await createProfile(openPopup);
	await button(page, "New task").click();
	await page.getByPlaceholder("Information").fill("Still useful tomorrow");
	await expect
		.poll(() => uiState(serviceWorker))
		.toMatchObject({
			route: { path: "/home/new-task" },
			drafts: {
				"task.new.fields": { information: "Still useful tomorrow" },
			},
		});
	await page.close();
	await serviceWorker.evaluate(async () => {
		await chrome.storage.session.set({
			"ui:route": {
				path: "/home/new-task",
				at: Date.now() - 31 * 60_000,
			},
		});
	});
	const restored = await openPopup("/");
	await expect(restored.getByRole("tablist")).toBeVisible();
	await expect(restored).toHaveURL(/#\/home$/);
	await button(restored, "New task").click();
	await expect(restored.getByPlaceholder("Information")).toHaveValue(
		"Still useful tomorrow",
	);
});

test("a minute typed just before the popup closes is kept", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await button(page, "New task").click();
	await option(page, "Type", "Due").click();
	const minute = page.getByLabel("mm", { exact: true });
	const desired = (await minute.inputValue()) === "37" ? "43" : "37";
	await minute.fill(desired);
	await expect(minute).toBeFocused();
	await page.close();
	const restored = await openPopup("/");
	await expect(restored).toHaveURL(/#\/home\/new-task$/);
	await expect(restored.getByLabel("mm", { exact: true })).toHaveValue(
		desired,
		{ timeout: 2_000 },
	);
});

test("Home restores its route after a reopen but clears search", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await seedSave(page, "Search draft sample");
	await page.getByRole("searchbox").fill("draft sample");
	await expect(
		page.getByText("Search draft sample", { exact: true }),
	).toBeVisible();
	await page.close();
	const restored = await openPopup("/");
	await expect(restored).toHaveURL(/#\/home$/);
	await expect(restored.getByRole("searchbox")).toHaveValue("");
});

test("Export restores its route without the unsaved format or backup password", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await page.goto(page.url().replace(/#.*/, "#/export"));
	await page
		.getByPlaceholder("Backup password")
		.fill("unsubmitted backup password");
	await page.close();
	const restored = await openPopup("/");
	await expect(restored).toHaveURL(/#\/export$/);
	await expect(restored.getByPlaceholder("Backup password")).toHaveValue("");
	await restored.getByText("Importable", { exact: true }).click();
	await restored.getByText("Readable", { exact: true }).click();
	await expect(
		restored.getByText(/Readable exports are plaintext/),
	).toBeVisible();
	await restored.close();

	const again = await openPopup("/");
	await expect(again).toHaveURL(/#\/export$/);
	await expect(again.getByPlaceholder("Backup password")).toBeVisible();
});
