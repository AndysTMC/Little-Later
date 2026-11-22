import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { createProfile, expect, test } from "./fixtures";
import {
	button,
	command,
	lock,
	rows,
	seedReminder,
	seedSave,
	seedTask,
	startVisitSite,
	tab,
	upload,
} from "./support";

const password = "different backup password";

const download = async (page: Page) => {
	const event = page.waitForEvent("download");
	await button(page, "Export").click();
	const result = await event;
	return {
		filename: result.suggestedFilename(),
		buffer: await readFile(await result.path()),
	};
};

const openExport = async (page: Page) => {
	await button(page, "Open profile menu").click();
	await button(page, "Settings").click();
	await button(page, "Export").click();
	await expect(page).toHaveURL(/#\/export$/);
};

const readable = async (page: Page) => {
	await openExport(page);
	await page.getByText("Importable", { exact: true }).click();
	await page.getByText("Readable", { exact: true }).click();
	return JSON.parse((await download(page)).buffer.toString());
};

// Imports go through their own page: the backup comes from the shared
// upload screen, the password is typed on the import page. A newer upload
// replaces the files a failed import left there.
const chooseBackup = async (page: Page, buffer: Buffer) => {
	if (page.url().endsWith("#/browse-profiles")) {
		await button(page, "Import a profile").click();
		await expect(page).toHaveURL(/#\/import-profile$/);
	}
	await button(
		page,
		/^(Upload a backup file|Change the backup files)$/,
	).click();
	await expect(page.getByText(/Little Later backup files/)).toBeVisible();
	await upload(page, [
		{ name: "fixture.lldat", mimeType: "application/octet-stream", buffer },
	]);
	await expect(page).toHaveURL(/#\/import-profile$/);
	await expect(button(page, "Change the backup files")).toContainText(
		"fixture.lldat",
	);
};

test("a downloaded backup imports as a new protected profile with every record and its links", async ({
	openPopup,
	context,
}) => {
	const page = await createProfile(
		openPopup,
		"Backup sample",
		"original profile password",
	);
	const site = await startVisitSite();
	try {
		const web = await context.newPage();
		await web.goto(site.url + "/backup");
		await expect.poll(() => rows(page, "assets")).toHaveLength(1);
		await seedSave(page, "Handbook");
		const [captured, saved] = await rows(page, "saves");
		const linked = [captured, saved].find((row) => row.saved === 1)!;
		const task = await seedTask(page, "Prepare shipment");
		const reminder = await seedReminder(page, "Call the carrier");
		await command(page, "note.create", {
			content: "A packing note",
			saveIds: [linked.id],
		});
		await command(page, "link.create", {
			fromId: task.id,
			toId: linked.id,
		});
		await command(page, "link.create", {
			fromId: reminder.id,
			toId: linked.id,
		});
		await command(page, "settings.update", {
			ai: {
				provider: "Custom",
				baseUrl: site.url + "/v1",
				apiKey: "synthetic-secret-to-omit",
				model: "local-fixture",
			},
			misc: { VBMLimit: 1200, VBMSameOriginLimit: 3 },
		});
		await page.bringToFront();

		const original = await readable(page);
		expect(original.settings.ai).toMatchObject({
			apiKey: "",
			model: "local-fixture",
		});
		expect(JSON.stringify(original)).not.toContain(
			"synthetic-secret-to-omit",
		);
		expect(original.saves).toHaveLength(2);
		for (const kind of ["notes", "tasks", "reminders"])
			expect(original[kind]).toHaveLength(1);
		expect(original.links).toHaveLength(3);

		await button(page, "Go back").click();
		await button(page, "Export").click();
		await page.getByPlaceholder("Backup password").fill(password);
		const backup = await download(page);
		expect(backup.filename).toMatch(/\.lldat$/);
		expect(
			backup.buffer.includes(Buffer.from("synthetic-secret-to-omit")),
		).toBe(false);
		await button(page, "Go back").click();
		await button(page, "Go back").click();
		await lock(page);

		await chooseBackup(page, backup.buffer);
		await page.getByLabel("Backup password").fill("wrong backup password");
		await button(page, "Import").click();
		await expect(page.getByRole("alert")).toContainText(
			/password is wrong/i,
		);
		expect(await rows(page, "profiles")).toHaveLength(1);
		await chooseBackup(
			page,
			backup.buffer.subarray(0, backup.buffer.length - 16),
		);
		await page.getByLabel("Backup password").fill(password);
		await button(page, "Import").click();
		await expect(page.getByRole("alert")).toContainText(
			"This backup is damaged.",
		);
		expect(await rows(page, "profiles")).toHaveLength(1);
		expect(await rows(page, "jobs")).toHaveLength(0);

		await chooseBackup(page, backup.buffer);
		await page.getByLabel("Backup password").fill(password);
		await button(page, "Import").click();
		await expect.poll(() => rows(page, "profiles")).toHaveLength(2);
		await expect(page).toHaveURL(/#\/browse-profiles$/);
		const profiles = await rows(page, "profiles");
		const imported = profiles.find(
			(profile) => !Object.is(profile.id, captured.profileId),
		)!;
		const originalButton = button(page, "Open profile Backup sample");
		await expect(originalButton).toHaveCount(2);
		await originalButton.first().click();
		await expect(page).toHaveURL(/#\/unlock\//);
		if (!page.url().endsWith("/" + imported.id)) {
			await button(page, "Go back").click();
			await originalButton.last().click();
		}
		await expect(page).toHaveURL(
			new RegExp("#/unlock/" + imported.id + "$"),
		);
		await page.getByLabel("Password", { exact: true }).fill(password);
		await button(page, "Unlock").click();
		await expect(page.getByRole("tablist")).toBeVisible();

		const restored = await readable(page);
		expect(restored.profile).toEqual(original.profile);
		expect(restored.settings.misc).toEqual(original.settings.misc);
		expect(restored.settings.ai).toMatchObject({ apiKey: "", model: "" });
		const ids = new Map<string, string>();
		for (const kind of ["saves", "notes", "tasks", "reminders"]) {
			const keyOf = (row: { url?: string }) => row.url ?? "";
			const previous = [...original[kind]].sort((a, b) =>
				keyOf(a).localeCompare(keyOf(b)),
			);
			const current = [...restored[kind]].sort((a, b) =>
				keyOf(a).localeCompare(keyOf(b)),
			);
			expect(current).toHaveLength(previous.length);
			for (const [index, record] of previous.entries()) {
				const { id, ...content } = record;
				const { id: newId, ...newContent } = current[index];
				expect(newId).not.toBe(id);
				expect(newContent).toEqual(content);
				ids.set(id, newId);
			}
		}
		expect(restored.links).toEqual(
			expect.arrayContaining(
				original.links.map(
					({ fromId, toId }: { fromId: string; toId: string }) => ({
						fromId: ids.get(fromId),
						toId: ids.get(toId),
					}),
				),
			),
		);
		expect(restored.links).toHaveLength(original.links.length);
		const assetRows = await rows(page, "assets");
		expect(
			assetRows.filter((row) => row.profileId === imported.id),
		).toHaveLength(1);
		await button(page, "Go back").click();
		await button(page, "Go back").click();
		await tab(page, "Saves").click();
		await expect(button(page, /Handbook/)).toBeVisible();
	} finally {
		await site.close();
	}
});
