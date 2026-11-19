import type { Locator, Page } from "@playwright/test";
import { createProfile, expect, test } from "./fixtures";
import {
	button,
	command,
	rows,
	seedReminder,
	seedSave,
	seedTask,
	tab,
} from "./support";

async function reachByTab(page: Page, control: Locator) {
	await expect(control).toBeVisible();
	for (let i = 0; i < 60; i++) {
		if ((await control.count()) === 0) break;
		if (
			await control.evaluate(
				(element) => document.activeElement === element,
			)
		)
			return;
		await page.keyboard.press("Tab");
	}
	await expect(control).toBeFocused({ timeout: 500 });
}

async function activate(page: Page, control: Locator) {
	await reachByTab(page, control);
	await page.keyboard.press("Enter");
}

test("profiles, tasks, notes and locking work with Tab, Enter and typed text", async ({
	openPopup,
}) => {
	test.setTimeout(80_000);
	const page = await openPopup("/browse-profiles");
	await activate(page, button(page, "Create a new profile"));
	await reachByTab(page, page.getByLabel("Profile name"));
	await page.keyboard.type("Keyboard profile");
	await activate(page, button(page, "Create"));
	await activate(page, button(page, "Skip"));
	await activate(page, button(page, "New task"));
	await reachByTab(page, page.locator("textarea"));
	await page.keyboard.type("Keyboard task");
	await activate(page, button(page, "Create"));
	await activate(page, tab(page, "Tasks"));
	await activate(page, button(page, "Mark task as finished"));
	await expect.poll(() => rows(page, "tasks")).toMatchObject([{ done: 1 }]);
	await activate(page, tab(page, "Notes"));
	await activate(page, button(page, "Create note"));
	await reachByTab(page, page.getByLabel("Note content"));
	await page.keyboard.type("Keyboard note");
	await activate(page, button(page, "Update"));
	await expect(
		page.getByText("Keyboard note", { exact: true }),
	).toBeVisible();
	await activate(page, button(page, "Go back"));
	await activate(page, tab(page, "Notes"));
	await activate(page, button(page, "Delete note"));
	await activate(page, button(page, "Confirm delete note"));
	await expect.poll(() => rows(page, "notes")).toHaveLength(0);

	await activate(page, button(page, "Open profile menu"));
	await activate(page, button(page, "Lock"));
	await expect(page).toHaveURL(/#\/lock$/);
	await expect(button(page, "Delete")).toBeVisible();
	await activate(page, button(page, "Lock"));
	await expect(button(page, "Open profile Keyboard profile")).toBeVisible();
});

test("rendered buttons on the exercised popup routes have accessible names", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await seedSave(page, "Named save");
	await seedTask(page, "Named task");
	await seedReminder(page, "Named reminder");
	await command(page, "note.create", { content: "Named note" });
	const unnamed: { route: string; markup: string[] }[] = [];
	const inspect = async (route: string) => {
		const markup = await page
			.getByRole("button", { name: /^$/ })
			.evaluateAll((nodes) =>
				nodes.map((node) => node.outerHTML.slice(0, 140)),
			);
		if (markup.length) unnamed.push({ route, markup });
	};
	for (const [name, control] of [
		["Saves", button(page, /Named save/)],
		["Tasks", button(page, /Named task/)],
		["Reminders", button(page, "Details")],
		["Notes", button(page, "Open note: Named note")],
	] as const) {
		await tab(page, name).click();
		await expect(control).toBeVisible();
		await inspect("Home " + name);
	}
	for (const [route, label] of [
		["/home/history", "New task for this page"],
		["/home/new-task", "Create"],
		["/home/new-reminder", "Create"],
		["/profile", "Add a profile photo"],
		["/settings", "Misc"],
		["/settings/ai", "Go back"],
		["/settings/misc", "Increase value"],
		["/settings/security", "Set a password"],
		["/settings/security/password", "Set password"],
		["/settings/security/two-factor", "Go back"],
		["/settings/appearance", "Go back"],
		["/export", "Export"],
		["/ai", "Send message"],
		["/note/new", "Update"],
		["/lock", "Lock"],
	] as const) {
		await page.goto(page.url().split("#")[0] + "#" + route);
		await expect(button(page, label).first()).toBeVisible();
		await inspect(route);
	}
	expect(unnamed).toEqual([]);
});

test("task Information keeps its accessible name while focused", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await button(page, "New task").click();
	const field = page.locator("textarea");
	await expect(field).toHaveAccessibleName("Information");
	await field.focus();
	await expect(field).toHaveAccessibleName("Information", { timeout: 1500 });
});

test("Export format options are reachable and selectable from the keyboard", async ({
	openPopup,
}) => {
	const home = await createProfile(openPopup);
	const page = await openPopup("/export");
	await home.close();
	await activate(
		page,
		page.getByText("Importable", { exact: true }).locator("../.."),
	);
	const readable = page.getByText("Readable", { exact: true });
	await reachByTab(page, readable);
	await page.keyboard.press("Enter");
	await expect(
		page.getByText(/Readable exports are plaintext/),
	).toBeVisible();
});

test("reduced motion removes the intro button's motion transitions", async ({
	context,
	extensionId,
}) => {
	const page = await context.newPage();
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("chrome-extension://" + extensionId + "/index.html#/");
	expect(
		await page.evaluate(
			() => matchMedia("(prefers-reduced-motion: reduce)").matches,
		),
	).toBe(true);
	const transition = await page.locator("video").evaluate((video) => {
		const element = video.parentElement!;
		element.style.transitionDuration = "1s";
		return parseFloat(getComputedStyle(element).transitionDuration);
	});
	expect(transition).toBeLessThan(0.001);
});
