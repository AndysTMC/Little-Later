import { createProfile, expect, test } from "./fixtures";
import {
	button,
	choose,
	dropdown,
	lock,
	rows,
	seedTask,
	tab,
	unlock,
} from "./support";

test("a password-protected profile rejects the wrong password and unlocks with the right one", async ({
	openPopup,
	serviceWorker,
}) => {
	const page = await createProfile(openPopup, "Ada", "first sample password");
	await lock(page);
	await button(page, "Open profile Ada").click();
	await page.getByLabel("Password", { exact: true }).fill("wrong password");
	await button(page, "Unlock").click();
	await expect(page.getByRole("alert")).toContainText(/password/i);
	await expect(page).toHaveURL(/#\/unlock\//);
	expect(
		await serviceWorker.evaluate(() =>
			chrome.storage.session.get("unlocked"),
		),
	).toEqual({});
	await page
		.getByLabel("Password", { exact: true })
		.fill("first sample password");
	await button(page, "Unlock").click();
	await expect(page.getByRole("tablist")).toBeVisible();
});

test("a password can be changed and then removed in Security settings", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup, "Ada", "first sample password");
	await button(page, "Open profile menu").click();
	await button(page, "Settings").click();
	await button(page, "Security").click();
	await button(page, "Change password").click();
	await page.getByLabel("Current password").fill("first sample password");
	await page
		.getByLabel("New password", { exact: true })
		.fill("second sample password");
	await page
		.getByLabel("Confirm new password")
		.fill("second sample password");
	await button(page, "Change password").click();
	await expect(page.getByRole("status")).toHaveText(/Password changed/);
	// Password, Security, then Settings.
	await button(page, "Go back").click();
	await button(page, "Go back").click();
	await button(page, "Go back").click();
	await lock(page);
	await unlock(page, "Ada", "second sample password");
	await button(page, "Open profile menu").click();
	await button(page, "Settings").click();
	await button(page, "Security").click();
	await button(page, "Change password").click();
	await page.getByLabel("Current password").fill("second sample password");
	await button(page, "Remove password…").click();
	await expect(page.getByRole("status")).toContainText(
		"Press again to confirm",
	);
	await button(page, "Remove password").click();
	await expect(page.getByRole("status")).toContainText("Password removed");
	// Password, Security, then Settings.
	await button(page, "Go back").click();
	await button(page, "Go back").click();
	await button(page, "Go back").click();
	await lock(page);
	await unlock(page, "Ada");
});

test("double clicking Delete cannot delete a passwordless profile", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await button(page, "Open profile menu").click();
	await button(page, "Lock").click();
	const deleteButton = button(page, "Delete");
	await expect(deleteButton).toBeVisible();
	const firstPress = new Date();
	await page.clock.setFixedTime(firstPress);
	await deleteButton.dblclick();
	await expect(button(page, "Confirm delete")).toBeVisible();
	expect(await rows(page, "profiles")).toHaveLength(1);
	await page.clock.setFixedTime(new Date(firstPress.getTime() + 900));
	await button(page, "Confirm delete").click();
	await expect(page.getByText("Choose Profile")).toBeVisible();
	expect(await rows(page, "profiles")).toHaveLength(0);
});

test("deleting a protected profile requires its password and deliberate confirmation", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup, "Ada", "first sample password");
	await lock(page);
	await button(page, "Open profile Ada").click();
	await button(page, "Delete").click();
	expect(await rows(page, "profiles")).toHaveLength(1);
	const password = page.getByLabel("Password to delete this profile");
	await password.fill("wrong sample password");
	await button(page, "Confirm delete").click();
	await expect(page.getByRole("alert")).toContainText(/password/i);
	expect(await rows(page, "profiles")).toHaveLength(1);
	await password.fill("first sample password");
	await button(page, "Confirm delete").click();
	await expect(page.getByText("Choose Profile")).toBeVisible();
	await expect(button(page, "Open profile Ada")).toHaveCount(0);
});

test("profiles see only their own records when switching through the picker", async ({
	openPopup,
}) => {
	const ada = await createProfile(openPopup, "Ada");
	await seedTask(ada, "Ada private task");
	await lock(ada);
	await button(ada, "Create a new profile").click();
	await ada.getByLabel("Profile name").fill("Grace");
	await button(ada, "Create").click();
	await expect(ada.getByRole("tablist")).toBeVisible();
	await seedTask(ada, "Grace private task");
	await tab(ada, "Tasks").click();
	await expect(
		ada.getByText("Grace private task", { exact: true }),
	).toBeVisible();
	await expect(
		ada.getByText("Ada private task", { exact: true }),
	).toHaveCount(0);
	await lock(ada);
	await unlock(ada, "Ada");
	await tab(ada, "Tasks").click();
	await expect(
		ada.getByText("Ada private task", { exact: true }),
	).toBeVisible();
	await expect(
		ada.getByText("Grace private task", { exact: true }),
	).toHaveCount(0);
});

test("idle minutes persist and a dark profile keeps its default icon on the light picker", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await button(page, "Switch to dark theme").click();
	await button(page, "Open profile menu").click();
	await button(page, "Settings").click();
	await button(page, "Misc").click();
	await expect
		.poll(() => rows(page, "profiles"))
		.toMatchObject([{ prefs: { theme: "dark" } }]);
	await expect(dropdown(page, "Lock after idle")).toHaveAccessibleName(
		"Lock after idle: 30 minutes, change",
	);
	await choose(page, "Lock after idle", "1 hour");
	await expect
		.poll(() => rows(page, "profiles"))
		.toMatchObject([{ prefs: { autoLockMinutes: 60 } }]);
	// Misc, then Settings.
	await button(page, "Go back").click();
	await button(page, "Go back").click();
	await lock(page);
	const icon = button(page, "Open profile Ada").locator("svg");
	await expect(icon).toBeVisible();
	await expect(icon).toHaveCSS("fill", "rgb(0, 0, 0)");
	await unlock(page, "Ada");
	await button(page, "Open profile menu").click();
	await button(page, "Settings").click();
	await button(page, "Misc").click();
	await expect(dropdown(page, "Lock after idle")).toHaveAccessibleName(
		"Lock after idle: 1 hour, change",
	);
});
