import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const SCREEN_DIR = path.resolve("artifacts/screenshots");

const toLittleDate = (date: Date): string => {
	const pad = (value: number) => String(value).padStart(2, "0");
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const absolute = Math.abs(offsetMinutes);
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
};

const capture = async (page: Page, name: string, waitFor?: Locator) => {
	if (waitFor) {
		await waitFor.waitFor({ state: "visible", timeout: 8000 });
	}
	await page.waitForTimeout(1500);
	await page.screenshot({
		path: path.join(SCREEN_DIR, `${name}.png`),
	});
};

const seedProfiles = async (page: Page) => {
	return await page.evaluate(async () => {
		const { createUser, unlockUser } =
			await import("/src/services/user.ts");
		const averyId = await createUser("Avery", null);
		await createUser("Blake", null);
		await unlockUser(averyId);
		return { averyId };
	});
};

const seedRecords = async (page: Page) => {
	const now = new Date();
	const later = toLittleDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));
	const earlier = toLittleDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
	const stamped = toLittleDate(now);

	return await page.evaluate(
		async ({ laterDate, earlierDate, nowDate }) => {
			const { createNote } = await import("/src/services/note.ts");
			const { createTask } = await import("/src/services/task.ts");
			const { createReminder } =
				await import("/src/services/reminder.ts");
			const { updateVisualBM } =
				await import("/src/services/visualBM.ts");

			const noteId = await createNote({
				content:
					"# Project notes\n\nShip the local-first vault polish.\n\n- [ ] Confirm export\n- [x] Fix focus chrome",
			});
			await createNote({
				content: "Quick scratch about the reminder copy.",
			});

			const taskId = await createTask({
				information: "Review export password flow",
				label: "Export review",
				priority: "high",
				finishDate: null,
				schedule: {
					type: "due",
					deadlineInfo: { deadlineDate: laterDate },
					recurringInfo: null,
				},
			});
			await createTask({
				information: "Inbox zero the captures",
				label: "Triage",
				priority: "low",
				finishDate: null,
				schedule: {
					type: "ad-hoc",
					deadlineInfo: null,
					recurringInfo: null,
				},
			});
			await createTask({
				information: "File last week's receipts",
				label: "Receipts",
				priority: "medium",
				finishDate: nowDate,
				schedule: {
					type: "due",
					deadlineInfo: { deadlineDate: earlierDate },
					recurringInfo: null,
				},
			});
			await createTask({
				information: "Renew the domain",
				label: "Domain",
				priority: "high",
				finishDate: null,
				schedule: {
					type: "due",
					deadlineInfo: { deadlineDate: earlierDate },
					recurringInfo: null,
				},
			});
			await createTask({
				information: "Write the weekly recap",
				label: "Recap",
				priority: "medium",
				finishDate: null,
				schedule: {
					type: "recurring",
					deadlineInfo: null,
					recurringInfo: {
						type: "weekly",
						time: "09:00:00+00:00",
						weekDay: 1,
						day: null,
						month: null,
					},
				},
			});

			const reminderId = await createReminder({
				message: "Lock the profile before you leave",
				type: "normal",
				targetDate: laterDate,
			});
			await createReminder({
				message: "Escalate if the backup is late",
				type: "escalating",
				targetDate: laterDate,
			});

			const saveId = await updateVisualBM("https://example.com/later", {
				title: "Little Later docs",
				isSaved: 1,
				hasBrowsed: 1,
			});
			await updateVisualBM("https://news.example.com/today", {
				title: "Morning briefing",
				isSaved: 0,
				hasBrowsed: 1,
			});
			await updateVisualBM("https://notes.example.com/draft", {
				title: "Draft notes",
				isSaved: 1,
				hasBrowsed: 1,
			});

			return { noteId, taskId, reminderId, saveId };
		},
		{ laterDate: later, earlierDate: earlier, nowDate: stamped },
	);
};

test("capture every popup screen and edge state", async ({ page }) => {
	await rm(SCREEN_DIR, { recursive: true, force: true });
	await mkdir(SCREEN_DIR, { recursive: true });
	page.setDefaultTimeout(12_000);

	await page.goto("/#/");
	await capture(page, "01-intro");

	await page.goto("/#/browse-profiles");
	await capture(
		page,
		"02-browse-profiles-empty",
		page.getByText("Choose Profile"),
	);

	await page.goto("/#/new-profile");
	await capture(page, "03-new-profile-idle", page.getByText("New Profile"));
	await page.getByLabel("Profile name").click();
	await capture(page, "04-new-profile-focused");
	await page.getByLabel("Profile name").fill("Avery");
	await capture(page, "05-new-profile-filled");

	const profiles = await seedProfiles(page);

	await page.goto("/#/browse-profiles");
	await capture(
		page,
		"06-browse-profiles-two-users",
		page.getByText("Avery"),
	);

	await page.goto("/#/home");
	await capture(page, "07-home-saves-empty", page.getByText("No saves yet?"));
	await page.getByRole("tab", { name: "Tasks" }).click();
	await capture(page, "08-home-tasks-empty", page.getByText("No tasks yet?"));
	await page.getByRole("tab", { name: "Reminders" }).click();
	await capture(
		page,
		"09-home-reminders-empty",
		page.getByText("No reminders yet?"),
	);
	await page.getByRole("tab", { name: "Notes" }).click();
	await capture(page, "10-home-notes-empty", page.getByText("No notes yet?"));

	await page.goto("/#/home/history");
	await capture(page, "11-history-empty", page.getByText("No history yet?"));

	const ids = await seedRecords(page);

	await page.goto("/#/home");
	await capture(page, "12-home-saves", page.getByText("Little Later docs"));
	await page.getByRole("tab", { name: "Tasks" }).click();
	await capture(page, "13-home-tasks-active", page.getByText("Active"));
	await expect(page.getByText("Finished")).toBeVisible();
	await expect(page.getByText("Missed")).toBeVisible();
	await capture(page, "14-home-tasks-groups", page.getByText("Missed"));
	await page.getByRole("tab", { name: "Reminders" }).click();
	await capture(page, "15-home-reminders", page.getByText("Normal"));
	await page.getByRole("tab", { name: "Notes" }).click();
	await capture(page, "16-home-notes", page.getByText("Project notes"));

	const search = page.getByRole("searchbox");
	await search.click();
	await search.fill("zzzz-no-match");
	await page.waitForTimeout(400);
	await capture(page, "17-search-empty", page.getByText("No results found"));
	await search.fill("export");
	await page.waitForTimeout(400);
	await capture(page, "18-search-results", page.getByText("Export review"));

	await page.goto("/#/home/history");
	await capture(page, "19-history", page.getByText("Morning briefing"));

	await page.goto("/#/home/new-task");
	await capture(page, "20-new-task", page.getByText("Information"));
	await page.goto("/#/home/new-reminder");
	await capture(page, "21-new-reminder", page.getByText("Message"));

	await page.goto(`/#/task/${ids.taskId}`);
	await capture(
		page,
		"22-task-detail",
		page.getByText("Review export password flow"),
	);
	await page.goto(`/#/reminder/${ids.reminderId}`);
	await capture(
		page,
		"23-reminder-detail",
		page.getByText("Lock the profile"),
	);
	await page.goto(`/#/note/${ids.noteId}`);
	await capture(page, "24-note-preview", page.getByText("Project notes"));
	await page.getByRole("button", { name: "Edit" }).click();
	await capture(
		page,
		"25-note-edit",
		page.getByRole("button", { name: "H1" }),
	);
	await page.goto(`/#/vbm/${ids.saveId}`);
	await capture(page, "26-save-detail", page.getByText("Open"));

	await page.goto("/#/task/99999");
	await capture(page, "27-task-missing", page.getByText("Task not found."));
	await page.goto("/#/reminder/99999");
	await capture(
		page,
		"28-reminder-missing",
		page.getByText("Reminder not found."),
	);
	await page.goto("/#/note/99999");
	await capture(page, "29-note-missing", page.getByText("Note not found."));
	await page.goto("/#/vbm/99999");
	await capture(page, "30-save-missing", page.getByText("Save not found."));
	await page.goto("/#/unlock/99999");
	await capture(
		page,
		"31-unlock-missing",
		page.getByText("Profile not found."),
	);

	await page.goto("/#/ai");
	await capture(page, "32-ai", page.getByText("Try one of these"));
	await page.goto("/#/settings");
	await capture(page, "33-settings", page.getByText("Getting Started"));
	await page.goto("/#/settings/ai");
	await capture(page, "34-settings-ai", page.getByText("AI Provider"));
	await page.goto("/#/settings/misc");
	await capture(page, "35-settings-misc", page.getByText("Misc Settings"));
	await page.goto("/#/export");
	await capture(
		page,
		"36-export-importable",
		page.getByText("lock password"),
	);
	await page.getByText("Importable").click();
	await page.getByText("Readable", { exact: true }).click();
	await capture(page, "37-export-readable", page.getByText("plaintext"));
	await page.goto("/#/profile");
	await capture(page, "38-profile", page.getByLabel("Name"));

	await page.goto("/#/lock");
	await capture(page, "39-lock", page.getByRole("button", { name: "Go" }));
	await page.getByLabel("Password").click();
	await capture(page, "40-lock-password-focused");
	await page.getByRole("button", { name: "Delete" }).click();
	await capture(
		page,
		"41-lock-confirm-delete",
		page.getByRole("button", { name: "Confirm delete" }),
	);

	await page.goto("/#/getting-started");
	await capture(page, "42-getting-started");

	await page.goto("/#/unlock/" + profiles.averyId);
	await capture(page, "43-unlock-already-open");

	await page.goto("/#/home");
	await page.getByRole("button", { name: "Switch to dark theme" }).click();
	await capture(page, "44-home-dark", page.getByText("Little Later docs"));
	await page.getByRole("tab", { name: "Tasks" }).click();
	await capture(page, "45-tasks-dark", page.getByText("Active"));
	await page.goto("/#/settings");
	await capture(page, "46-settings-dark", page.getByText("Getting Started"));
	await page.goto("/#/export");
	await capture(
		page,
		"47-export-dark",
		page.getByText("Choose Export Format"),
	);
	await page.goto("/#/lock");
	await capture(
		page,
		"48-lock-dark",
		page.getByRole("button", { name: "Go" }),
	);
	await page.goto("/#/ai");
	await capture(page, "49-ai-dark", page.getByText("Try one of these"));
	await page.goto("/#/note/" + ids.noteId);
	await capture(page, "50-note-dark", page.getByText("Project notes"));
});
