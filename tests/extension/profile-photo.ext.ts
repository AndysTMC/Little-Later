import type { Page } from "@playwright/test";
import { createProfile, expect, test } from "./fixtures";
import { button, giveFiles, upload } from "./support";

// A 1x1 PNG.
const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
	"base64",
);
const photo = { name: "me.png", mimeType: "image/png", buffer: PNG };

const storedAvatars = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<number>((resolve, reject) => {
				const open = indexedDB.open("little");
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const count = open.result
						.transaction("avatars")
						.objectStore("avatars")
						.count();
					count.onsuccess = () => resolve(count.result);
					count.onerror = () => reject(count.error);
				};
			}),
	);

// Files are given to the shared upload screen by paste or drop: the toolbar
// popup closes when a system file window opens, so it has no file input.

test("a profile photo chosen from the profile page is stored and shown", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await page.goto(page.url().replace(/#.*/, "#/profile"));
	expect(await storedAvatars(page)).toBe(0);

	await button(page, "Add a profile photo").click();
	await expect(page.getByText("up to 2 MB")).toBeVisible();
	await upload(page, [photo]);

	await expect(page).toHaveURL(/#\/profile$/);
	await expect(page.getByAltText("Profile photo")).toBeVisible();
	await expect.poll(() => storedAvatars(page)).toBe(1);
});

test("a new profile keeps its name and photo across the upload screen and a reopen", async ({
	openPopup,
}) => {
	const first = await openPopup("/new-profile");
	await first.getByLabel("Profile name").fill("Grace");
	await button(first, "Add a profile photo").click();
	await upload(first, [photo]);
	await expect(first).toHaveURL(/#\/new-profile$/);
	await expect(first.getByAltText("Profile photo")).toBeVisible();
	// The popup closing here must lose neither.
	await first.close();

	const second = await openPopup("/");
	await expect(second).toHaveURL(/#\/new-profile$/);
	await expect(second.getByLabel("Profile name")).toHaveValue("Grace");
	await expect(second.getByAltText("Profile photo")).toBeVisible();

	await button(second, "Create").click();
	await button(second, "Skip").click();
	await expect(second.getByRole("tablist")).toBeVisible();
	await expect.poll(() => storedAvatars(second)).toBe(1);
});

test("a file of the wrong kind is refused with the reason", async ({
	openPopup,
}) => {
	const page = await openPopup("/new-profile");
	await button(page, "Add a profile photo").click();
	await giveFiles(page, [
		{
			name: "notes.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("hello"),
		},
	]);
	await expect(page.getByRole("alert")).toContainText(
		"not a file this accepts",
	);
	await expect(button(page, "Upload")).toBeDisabled();
	await expect(page).toHaveURL(/#\/pick-file\?/);
});

for (const how of ["paste", "drop"] as const) {
	test(
		"the upload screen takes an image by " + how,
		async ({ openPopup }) => {
			const page = await openPopup("/new-profile");
			await button(page, "Add a profile photo").click();
			await expect(
				page.getByText(/PNG, JPEG, WebP or GIF/),
			).toBeVisible();
			await giveFiles(
				page,
				[{ name: "portrait.png", mimeType: "image/png", buffer: PNG }],
				how,
			);
			await expect(
				page.getByTestId("upload-area").getByText("portrait.png"),
			).toBeVisible();
			await button(page, "Upload").click();
			await expect(page).toHaveURL(/#\/new-profile$/);
			await expect(page.getByAltText("Profile photo")).toBeVisible();
			await button(page, "Remove profile photo").click();
			await expect(page.getByAltText("Profile photo")).toHaveCount(0);
			await page.close();
			const reopened = await openPopup("/");
			await expect(reopened).toHaveURL(/#\/new-profile$/);
			await expect(button(reopened, "Add a profile photo")).toBeVisible();
		},
	);
}

test("empty and oversized photos are refused with different reasons", async ({
	openPopup,
}) => {
	const page = await openPopup("/new-profile");
	await button(page, "Add a profile photo").click();
	await giveFiles(page, [{ ...photo, buffer: Buffer.alloc(0) }]);
	await expect(page.getByRole("alert")).toContainText("empty");
	await giveFiles(page, [
		{ ...photo, buffer: Buffer.alloc(2 * 1024 * 1024 + 1) },
	]);
	await expect(page.getByRole("alert")).toContainText("too large");
	await expect(button(page, "Upload")).toBeDisabled();
	await expect(page).toHaveURL(/#\/pick-file\?/);
});

test("a one-file request keeps only the newest paste", async ({
	openPopup,
}) => {
	const page = await openPopup("/new-profile");
	await button(page, "Add a profile photo").click();
	await giveFiles(page, [{ ...photo, name: "first.png" }]);
	const area = page.getByTestId("upload-area");
	await expect(area.getByText("first.png")).toBeVisible();
	await giveFiles(page, [{ ...photo, name: "second.png" }]);
	await expect(area.getByText("second.png")).toBeVisible();
	await expect(area.getByText("first.png")).toHaveCount(0);
});

// Chrome closes the toolbar popup whenever it loses focus, which is easy
// to do while copying a file elsewhere.
test("a pasted file survives the popup closing before Upload", async ({
	openPopup,
}) => {
	const first = await openPopup("/new-profile");
	await button(first, "Add a profile photo").click();
	await giveFiles(first, [photo]);
	await expect(
		first.getByTestId("upload-area").getByText("me.png"),
	).toBeVisible();
	await first.close();

	const second = await openPopup("/");
	await expect(second).toHaveURL(/#\/pick-file\?/);
	await expect(
		second.getByTestId("upload-area").getByText("me.png"),
	).toBeVisible();
	await button(second, "Upload").click();
	await expect(second).toHaveURL(/#\/new-profile$/);
	await expect(second.getByAltText("Profile photo")).toBeVisible();
});
