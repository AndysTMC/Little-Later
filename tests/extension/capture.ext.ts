import type { Page } from "@playwright/test";
import { createProfile, expect, test } from "./fixtures";
import {
	button,
	command,
	lock,
	rows,
	startLocalServer,
	startVisitSite,
	unlock,
} from "./support";

// A local site whose page looks different on every load, under the same
// URL and title, the way a feed or a document being edited does.
// The shared server closes Chrome's keep-alive connections on close; a
// plain server.close() waited for them and timed out the teardown.
const startSite = async () => {
	let hits = 0;
	const server = await startLocalServer((_request, response) => {
		hits += 1;
		const colour = ["#c00", "#0a0", "#00c", "#990"][hits % 4];
		response.setHeader("Content-Type", "text/html");
		response.end(
			`<title>Capture page</title><body style="margin:0;background:${colour}"><h1 style="font-size:120px;color:#fff">${hits}</h1></body>`,
		);
	});
	return { url: `${server.url}/page`, close: server.close };
};

// Sizes of the stored previews, read from an extension page.
const previews = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<Array<{ id: string; size: number }>>(
				(resolve, reject) => {
					const open = indexedDB.open("little");
					open.onerror = () => reject(open.error);
					open.onsuccess = () => {
						const all = open.result
							.transaction("assets")
							.objectStore("assets")
							.getAll();
						all.onerror = () => reject(all.error);
						all.onsuccess = () =>
							resolve(
								all.result.map(
									(row: {
										id: string;
										body: Uint8Array;
									}) => ({
										id: row.id,
										size: row.body.byteLength,
									}),
								),
							);
					};
				},
			),
	);

test("a visited page is recorded with a preview", async ({
	context,
	openPopup,
}) => {
	const site = await startSite();
	const popup = await createProfile(openPopup);

	const web = await context.newPage();
	await web.goto(site.url);
	await web.bringToFront();

	await expect
		.poll(() => previews(popup), { timeout: 20_000 })
		.toHaveLength(1);
	await site.close();
});

test("a page that changes while it stays open gets a newer preview", async ({
	context,
	openPopup,
	currentServiceWorker,
}) => {
	const site = await startSite();
	const popup = await createProfile(openPopup);

	const web = await context.newPage();
	await web.goto(site.url);
	await web.bringToFront();
	await expect
		.poll(() => previews(popup), { timeout: 20_000 })
		.toHaveLength(1);
	const [first] = await previews(popup);
	const storedVisit = await rows(popup, "saves");
	expect(storedVisit).toHaveLength(1);

	// Same URL and title, different pixels.
	await web.evaluate(() => {
		document.body.style.background = "#000";
		document.querySelector("h1")!.textContent = "changed";
	});
	// The capture alarm is what notices. Fire it now and again instead of
	// waiting for its half-minute period; a page is looked at again at
	// most every 15 seconds.
	const worker = await currentServiceWorker();
	await expect
		.poll(
			async () => {
				await worker.evaluate(() =>
					chrome.alarms.create("captureActiveTab", {
						when: Date.now(),
						periodInMinutes: 0.5,
					}),
				);
				return (await previews(popup))[0]?.id;
			},
			{ timeout: 40_000, intervals: [2_000] },
		)
		.not.toBe(first.id);
	expect(await previews(popup)).toHaveLength(1);
	expect(await rows(popup, "saves")).toEqual(storedVisit);
	await site.close();
});

test("background loads and visits while locked do not add History entries", async ({
	context,
	openPopup,
	serviceWorker,
}) => {
	const site = await startVisitSite();
	const page = await createProfile(openPopup);
	try {
		const background = await context.newPage();
		await page.bringToFront();
		await background.goto(site.url + "/background");
		expect(
			await serviceWorker.evaluate(
				async (url) => (await chrome.tabs.query({ url }))[0]?.active,
				background.url(),
			),
		).toBe(false);

		const visible = await context.newPage();
		await visible.goto(site.url + "/foreground");
		await expect.poll(() => rows(page, "saves")).toHaveLength(1);
		const before = await rows(page, "saves");
		await page.bringToFront();
		await button(page, "History").click();
		await expect(
			page.getByText("Visit foreground", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Visit background", { exact: true }),
		).toHaveCount(0);
		await button(page, "History").click();
		await lock(page);
		await expect
			.poll(() =>
				serviceWorker.evaluate(() =>
					chrome.alarms.get("captureActiveTab"),
				),
			)
			.toBeUndefined();

		await visible.bringToFront();
		await visible.goto(site.url + "/locked");
		await page.bringToFront();
		await unlock(page, "Ada");
		expect(await rows(page, "saves")).toEqual(before);
		await button(page, "History").click();
		await expect(
			page.getByText("Visit locked", { exact: true }),
		).toHaveCount(0);
	} finally {
		await site.close();
	}
});

test("the per-site limit evicts the oldest unsaved visit and retains a saved page", async ({
	context,
	openPopup,
}) => {
	const site = await startVisitSite();
	const page = await createProfile(openPopup);
	try {
		await command(page, "settings.update", {
			misc: { VBMLimit: 1000, VBMSameOriginLimit: 2 },
		});
		await command(page, "save.capture", {
			url: site.url + "/saved",
			title: "Kept save",
			saved: true,
		});
		const web = await context.newPage();
		await web.goto(site.url + "/oldest");
		await expect.poll(() => rows(page, "saves")).toHaveLength(2);
		const oldest = (await rows(page, "saves")).find(
			(row) => row.saved === 0,
		)!;
		await web.goto(site.url + "/middle");
		await expect.poll(() => rows(page, "saves")).toHaveLength(3);
		await web.goto(site.url + "/newest");
		await expect
			.poll(async () => (await rows(page, "saves")).map((row) => row.id))
			.not.toContain(oldest.id);
		await page.bringToFront();
		await button(page, "History").click();
		for (const title of ["Kept save", "Visit middle", "Visit newest"]) {
			await expect(page.getByText(title, { exact: true })).toBeVisible();
		}
		await expect(
			page.getByText("Visit oldest", { exact: true }),
		).toHaveCount(0);
		expect(await rows(page, "saves")).toHaveLength(3);
	} finally {
		await site.close();
	}
});

test("the total History cap evicts the oldest visit across sites", async ({
	context,
	openPopup,
}) => {
	test.setTimeout(120_000);
	const site = await startVisitSite();
	const home = await createProfile(openPopup);
	const writer = await openPopup("/browse-profiles");
	await home.close();
	try {
		const first = await command<{ id: string }>(writer, "save.capture", {
			url: site.url + "/oldest",
			title: "Oldest visit",
		});
		// The minimum cap is 1000. Arrange that many visits through real
		// commands, distributing them across origins below the per-site cap.
		await writer.evaluate(async () => {
			for (let index = 1; index < 1000; index++) {
				const result = await chrome.runtime.sendMessage({
					type: "little/command",
					name: "save.capture",
					input: {
						url:
							"http://127.0.0.1:" +
							(20_000 + Math.floor(index / 4)) +
							"/" +
							index,
						title: "Seed visit " + index,
					},
				});
				if (!result?.ok)
					throw new Error("Could not seed visit " + index);
			}
		});
		const before = await rows(writer, "saves");
		expect(before).toHaveLength(1000);
		const firstIds = before.map((row) => row.id);
		expect(firstIds).toContain(first.id);
		const web = await context.newPage();
		await web.goto(site.url + "/beyond-cap");
		await expect
			.poll(async () =>
				(await rows(writer, "saves")).map((row) => row.id),
			)
			.not.toContain(first.id);
		const after = await rows(writer, "saves");
		expect(after).toHaveLength(1000);
		const remaining = new Set(after.map((row) => row.id));
		expect(firstIds.filter((id) => !remaining.has(id))).toEqual([first.id]);
	} finally {
		await site.close();
	}
});
