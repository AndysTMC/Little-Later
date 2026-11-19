import type { Page } from "@playwright/test";
import { createProfile, expect, sendCommand, test } from "./fixtures";
import {
	button,
	openNote,
	option,
	rows,
	seedReminder,
	seedSave,
	startVisitSite,
	tab,
} from "./support";

const exactText = (page: Page, text: string) =>
	page.getByText(text, { exact: true });

const linkSave = async (page: Page, name: string) => {
	await button(page, "Link a save").click();
	await button(page, new RegExp(name)).click();
	await expect(button(page, "Unlink save: " + name)).toBeVisible();
};

test("save and rename a visit, add and update its linked note, then confirm removing the save", async ({
	openPopup,
	context,
}) => {
	const page = await createProfile(openPopup);
	const site = await startVisitSite();
	try {
		const web = await context.newPage();
		await web.goto(site.url + "/article");
		await expect.poll(() => rows(page, "saves")).toHaveLength(1);
		await page.bringToFront();

		await button(page, "History").click();
		await button(page, "Save this page").click();
		await expect(button(page, "Saved")).toBeVisible();
		await button(page, "History").click();
		await tab(page, "Saves").click();
		await button(page, /Visit article/).click();
		await button(page, "Edit save").click();
		await page
			.getByPlaceholder("Name", { exact: true })
			.fill("Renamed article");
		await button(page, "Add note").click();
		await page
			.getByPlaceholder("Write note...")
			.fill("Note attached to the article");
		await button(page, "Update").click();
		await expect.poll(() => rows(page, "links")).toHaveLength(1);
		await expect.poll(() => rows(page, "notes")).toHaveLength(1);
		await expect(page.getByPlaceholder("Write note...")).toHaveValue(
			"Note attached to the article",
		);
		await page
			.getByPlaceholder("Write note...")
			.fill("Revised linked note");
		await button(page, "Update").click();
		await button(page, "Go back").click();

		await tab(page, "Saves").click();
		await button(page, /Renamed article/).click();
		await expect(exactText(page, "Revised linked note")).toBeVisible();
		await button(page, "Delete").click();
		expect((await rows(page, "saves"))[0]?.saved).toBe(1);
		await button(page, "Confirm delete").click();
		await expect(button(page, /Renamed article/)).toHaveCount(0);
		await expect
			.poll(() => rows(page, "saves"))
			.toMatchObject([{ saved: 0 }]);
		await expect.poll(() => rows(page, "links")).toHaveLength(0);
		await tab(page, "Notes").click();
		await expect(
			button(page, "Open note: Revised linked note"),
		).toBeVisible();
	} finally {
		await site.close();
	}
});

test("a standalone note can be created, edited, and deleted after confirmation", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await tab(page, "Notes").click();
	await button(page, "Create note").click();
	await page.getByLabel("Note content").fill("Draft for garden plan");
	await button(page, "Update").click();
	await expect(exactText(page, "Draft for garden plan")).toBeVisible();
	await button(page, "Go back").click();
	await openNote(page, "Draft for garden plan");
	await button(page, "Edit").click();
	await page.getByLabel("Note content").fill("Revised garden plan");
	await button(page, "Update").click();
	await expect(exactText(page, "Revised garden plan")).toBeVisible();
	await button(page, "Go back").click();
	await tab(page, "Notes").click();
	await button(page, "Delete note").click();
	expect(await rows(page, "notes")).toHaveLength(1);
	await button(page, "Confirm delete note").click();
	await expect(button(page, "Open note: Revised garden plan")).toHaveCount(0);
	await expect.poll(() => rows(page, "notes")).toHaveLength(0);
});

test("a due task links and unlinks a save, can complete and reopen, and confirms deletion", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await seedSave(page, "Release page");
	await button(page, "New task").click();
	await page.getByPlaceholder("Information").fill("Write release notes");
	await option(page, "Type").click();
	await expect(exactText(page, "Deadline")).toBeVisible();
	await linkSave(page, "Release page");
	await button(page, "Create").click();
	await tab(page, "Tasks").click();
	await expect(exactText(page, "Write release notes")).toBeVisible();
	await expect
		.poll(() => rows(page, "tasks"))
		.toMatchObject([{ schedule: { kind: "due" }, done: 0 }]);
	expect(await rows(page, "links")).toHaveLength(1);
	await button(page, "Edit task").click();
	await page.getByPlaceholder("Information").fill("Publish release notes");
	await button(page, "Unlink save: Release page").click();
	await button(page, "Update").click();
	await expect.poll(() => rows(page, "links")).toHaveLength(0);
	await button(page, "Go back").click();
	await tab(page, "Tasks").click();
	await expect(exactText(page, "Publish release notes")).toBeVisible();
	await button(page, "Mark task as finished").click();
	await expect.poll(() => rows(page, "tasks")).toMatchObject([{ done: 1 }]);
	await button(page, "Mark task as unfinished").click();
	await expect.poll(() => rows(page, "tasks")).toMatchObject([{ done: 0 }]);
	await button(page, /Publish release notes/).click();
	await button(page, "Delete").click();
	expect(await rows(page, "tasks")).toHaveLength(1);
	await button(page, "Confirm delete").click();
	await expect(exactText(page, "Publish release notes")).toHaveCount(0);
	expect(await rows(page, "tasks")).toHaveLength(0);
});

test("completing a recurring task keeps it open and advances its next occurrence", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await button(page, "New task").click();
	await page.getByPlaceholder("Information").fill("Recurring watering task");
	await option(page, "Type", "Previous").click();
	await expect(exactText(page, "Recurring")).toBeVisible();
	await button(page, "Create").click();
	await tab(page, "Tasks").click();
	await expect(exactText(page, "Recurring watering task")).toBeVisible();
	const [before] = await rows<{ id: string; dueAt: number }>(page, "tasks");
	expect(before).toMatchObject({ schedule: { kind: "recurring" }, done: 0 });
	await button(page, "Mark task as finished").click();
	await expect
		.poll(
			async () =>
				(await rows<{ id: string; dueAt: number }>(page, "tasks"))[0]
					?.dueAt,
		)
		.toBeGreaterThan(before.dueAt);
	expect(await rows(page, "tasks")).toMatchObject([
		{ id: before.id, done: 0 },
	]);
});

test("a reminder can link and unlink a save, be edited, and be deleted with confirmation", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await seedSave(page, "Manual page");
	await button(page, "New reminder").click();
	await page.getByPlaceholder("Message").fill("Read the manual");
	await linkSave(page, "Manual page");
	await button(page, "Create").click();
	await tab(page, "Reminders").click();
	await button(page, "Details").click();
	await expect(exactText(page, "Read the manual")).toBeVisible();
	expect(await rows(page, "links")).toHaveLength(1);
	await button(page, "Edit reminder").click();
	await page.getByPlaceholder("Message").fill("Read the updated manual");
	await button(page, "Unlink save: Manual page").click();
	await button(page, "Update").click();
	await expect.poll(() => rows(page, "links")).toHaveLength(0);
	await button(page, "Go back").click();
	await tab(page, "Reminders").click();
	await button(page, "Details").click();
	await expect(exactText(page, "Read the updated manual")).toBeVisible();
	await button(page, "Delete").click();
	expect(await rows(page, "reminders")).toHaveLength(1);
	await button(page, "Confirm delete").click();
	await expect(exactText(page, "Read the updated manual")).toHaveCount(0);
	expect(await rows(page, "reminders")).toHaveLength(0);
});

test("a task's reminder can only be edited or removed through its task", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await button(page, "New task").click();
	await page.getByPlaceholder("Information").fill("Task owns this alert");
	await option(page, "Type").click();
	await option(page, "Reminder").click();
	await expect(exactText(page, "Normal")).toBeVisible();
	await button(page, "Create").click();
	await tab(page, "Reminders").click();
	await button(page, "Details").click();
	await expect(exactText(page, "Task owns this alert")).toBeVisible();
	await expect(button(page, "Delete")).toBeDisabled();
	const [reminder] = await rows(page, "reminders");
	for (const [command, input] of [
		["reminder.update", { id: reminder.id, message: "Independent edit" }],
		["reminder.delete", { id: reminder.id }],
	] as const) {
		expect(await sendCommand(page, command, input)).toMatchObject({
			ok: false,
			error: { message: "Change or remove this reminder on its task." },
		});
	}
	await expect(button(page, "Edit this reminder on its task")).toBeDisabled();
	await tab(page, "Tasks").click();
	await button(page, "Edit task").click();
	await expect(page).toHaveURL(/#\/task\//);
	await option(page, "Reminder", "Previous").click();
	await button(page, "Update").click();
	await expect.poll(() => rows(page, "reminders")).toHaveLength(0);
});

test("global search returns a save, a task, a reminder, and a note", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await seedSave(page, "Mistral save");
	await seedReminder(page, "Mistral reminder");
	await sendCommand(page, "note.create", { content: "Mistral note" });
	await sendCommand(page, "task.create", {
		information: "Mistral task",
		label: "",
		priority: "medium",
		schedule: { kind: "anytime" },
	});
	const search = page.getByRole("searchbox");
	await search.fill("Mistral");
	await expect(button(page, /Mistral save/)).toBeVisible();
	await expect(button(page, /Mistral task/)).toBeVisible();
	await expect(button(page, "Open note: Mistral note")).toBeVisible();
	await expect(button(page, "Details")).toBeVisible();
	// Opening the reminder result reveals its body; it isn't printed on the collapsed row.
	await button(page, "Details").click();
	await expect(exactText(page, "Mistral reminder")).toBeVisible();
});

test("a standalone note can be attached to and detached from a save in its editor", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	const saved = await seedSave(page, "Existing travel guide");
	await tab(page, "Notes").click();
	await button(page, "Create note").click();
	await page.getByLabel("Note content").fill("A standalone itinerary");
	await button(page, "Update").click();
	await expect(exactText(page, "A standalone itinerary")).toBeVisible();
	await button(page, "Edit").click();
	await expect(button(page, "Link a save")).toBeVisible({ timeout: 2_000 });
	await linkSave(page, "Existing travel guide");
	await button(page, "Update").click();
	await expect
		.poll(() => rows(page, "links"))
		.toMatchObject([{ toId: saved.id }]);
	await button(page, "Edit").click();
	await button(page, "Unlink save: Existing travel guide").click();
	await button(page, "Update").click();
	await expect.poll(() => rows(page, "links")).toHaveLength(0);
	expect(await rows(page, "saves")).toHaveLength(1);
	expect(await rows(page, "notes")).toHaveLength(1);
});
