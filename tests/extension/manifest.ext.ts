import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { startVisitSite } from "./support";

test("the built manifest matches permissions and CSP and keeps assets internal", async ({
	extensionId,
	serviceWorker,
	context,
}) => {
	const source = JSON.parse(
		await readFile(new URL("../../manifest.json", import.meta.url), "utf8"),
	);
	const manifest = await serviceWorker.evaluate(() =>
		chrome.runtime.getManifest(),
	);
	expect(manifest.permissions?.slice().sort()).toEqual(
		[...source.permissions].sort(),
	);
	expect(manifest.host_permissions).toEqual(source.host_permissions);
	expect(manifest.content_security_policy).toEqual(
		source.content_security_policy,
	);
	expect(manifest.web_accessible_resources ?? []).toEqual([]);
	const image = "icons/little-later-16x16.png";
	expect(
		await serviceWorker.evaluate(
			async (path) => (await fetch(chrome.runtime.getURL(path))).ok,
			image,
		),
	).toBe(true);
	const site = await startVisitSite();
	try {
		const page = await context.newPage();
		await page.goto(site.url + "/manifest");
		const loaded = await page.evaluate(
			(url) =>
				new Promise<boolean>((resolve) => {
					const image = new Image();
					image.onload = () => resolve(true);
					image.onerror = () => resolve(false);
					image.src = url;
					document.body.append(image);
				}),
			"chrome-extension://" + extensionId + "/" + image,
		);
		expect(loaded).toBe(false);
	} finally {
		await site.close();
	}
});
