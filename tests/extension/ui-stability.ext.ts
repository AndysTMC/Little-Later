import type { Locator, Page } from "@playwright/test";
import { createProfile, expect, test } from "./fixtures";
import {
	button,
	command,
	openNote,
	rows,
	seedSave,
	startVisitSite,
	tab,
} from "./support";

// A transient spinner can disappear before the assertion. Record its
// insertion and the removal of the control that was originally on screen.
const observe = async (locator: Locator) =>
	locator.evaluateHandle((original) => {
		const loading = '[style*="animation-name: wave-"]';
		const evidence = { loading: 0, disconnected: false };
		const observer = new MutationObserver((records) => {
			evidence.disconnected ||= !original.isConnected;
			for (const record of records) {
				for (const node of record.addedNodes) {
					if (
						node instanceof Element &&
						(node.matches(loading) || node.querySelector(loading))
					) {
						evidence.loading++;
					}
				}
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
		return {
			read: () => ({
				...evidence,
				disconnected: evidence.disconnected || !original.isConnected,
			}),
		};
	});

const expectUninterrupted = async (
	watch: Awaited<ReturnType<typeof observe>>,
) => {
	expect(await watch.evaluate((value) => value.read())).toEqual({
		loading: 0,
		disconnected: false,
	});
	await watch.dispose();
};

async function afterPaint(page: Page) {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() =>
					requestAnimationFrame(() => resolve()),
				),
			),
	);
}

test("background visits and writes leave a half-filled task on screen", async ({
	openPopup,
	context,
}) => {
	const page = await createProfile(openPopup);
	await button(page, "New task").click();
	const information = page.getByRole("textbox", { name: "Information" });
	const label = page.getByRole("textbox", { name: "Label" });
	await information.fill("Draft during capture");
	await label.fill("Keep this label");
	const watch = await observe(information);
	const site = await startVisitSite();
	try {
		const web = await context.newPage();
		await web.goto(site.url + "/while-editing");
		await expect.poll(() => rows(page, "saves")).toHaveLength(1);
		await page.bringToFront();
		const writer = await openPopup("/home");
		await command(writer, "note.create", {
			content: "A second page writes this note",
		});
		await writer.close();
		await afterPaint(page);
		await expect(page).toHaveURL(/#\/home\/new-task$/);
		await expect(information).toHaveValue("Draft during capture");
		await expect(label).toHaveValue("Keep this label");
		await expectUninterrupted(watch);
	} finally {
		await site.close();
	}
});

test("another extension page does not collapse an expanded save", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await seedSave(page, "Expanded document");
	await tab(page, "Saves").click();
	await button(page, /Expanded document/).click();
	const edit = button(page, "Edit save");
	await expect(edit).toBeVisible();
	const watch = await observe(edit);
	const writer = await openPopup("/home");
	await seedSave(writer, "Newly inserted document");
	await writer.close();
	await expect(button(page, /Newly inserted document/)).toBeVisible();
	await expect(edit).toBeVisible();
	await expect(page).toHaveURL(/#\/home$/);
	await expectUninterrupted(watch);
});

test("a live capture and its preview do not shift a visible History row", async ({
	openPopup,
	context,
}) => {
	const page = await createProfile(openPopup);
	await page.setViewportSize({ width: 420, height: 440 });
	for (const title of ["One", "Two", "Three", "Four", "Five"]) {
		await seedSave(page, "History " + title, false);
	}
	await button(page, "History").click();
	const history = page.locator("div.overflow-y-auto").filter({
		has: button(page, "New task for this page"),
	});
	await expect(history).toBeVisible();
	await history.evaluate((element) => {
		element.scrollTop = 90;
	});
	const position = await history.evaluate((element) => element.scrollTop);
	expect(position).toBeGreaterThan(0);
	const watch = await observe(history);
	const anchor = page.getByText("History Four", { exact: true });
	const offset = () =>
		anchor.evaluate((element) => element.getBoundingClientRect().top);
	const anchorTop = await offset();
	const site = await startVisitSite();
	try {
		const web = await context.newPage();
		await web.goto(site.url + "/new-history-row");
		await expect(
			page.getByText("Visit new-history-row", { exact: true }),
		).toBeVisible();
		await page.bringToFront();
		// Scroll anchoring compensates for the row inserted above this one.
		await expect
			.poll(async () => Math.abs((await offset()) - anchorTop))
			.toBeLessThanOrEqual(1);
		expect(
			await history.evaluate((element) => element.scrollTop),
		).toBeGreaterThan(0);
		await expect(page).toHaveURL(/#\/home\/history$/);
		await expectUninterrupted(watch);
	} finally {
		await site.close();
	}
});

test("an existing note stays in Edit with unsaved text during live writes", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await command(page, "note.create", { content: "Original note" });
	await openNote(page, "Original note");
	await button(page, "Edit").click();
	const editor = page.getByLabel("Note content");
	await editor.fill("Unsaved change");
	const watch = await observe(editor);
	const route = page.url();
	const writer = await openPopup("/home");
	await command(writer, "note.create", { content: "Another note" });
	await seedSave(writer, "Concurrent save");
	await writer.close();
	await afterPaint(page);
	await expect(page).toHaveURL(route);
	await expect(editor).toHaveValue("Unsaved change");
	await expectUninterrupted(watch);
});
