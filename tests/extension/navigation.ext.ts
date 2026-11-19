import type { Locator, Page } from "@playwright/test";
import { createProfile, expect, test } from "./fixtures";
import {
	button,
	forgetUIState,
	command,
	seedReminder,
	seedSave,
	seedTask,
	type RecordId,
} from "./support";
import { pickRoute } from "../../src/popup/filePick";
import { AVATAR_REQUEST } from "../../src/popup/components/LUIAvatarInput/request";

test("unlocked popup opens directly on every inner route", async ({
	openPopup,
	context,
}) => {
	test.setTimeout(90_000);
	const setup = await createProfile(openPopup);
	const save = await seedSave(setup, "Deep link save");
	const task = await seedTask(setup, "Deep link task");
	const reminder = await seedReminder(setup, "Deep link reminder");
	const note = await command<RecordId>(setup, "note.create", {
		content: "Deep link note",
	});
	await seedSave(setup, "History for direct open", false);
	await setup.close();

	await context.addInitScript(() => {
		const visited = [window.location.hash];
		const record = () => visited.push(window.location.hash);
		window.addEventListener("hashchange", record);
		const replaceState = history.replaceState.bind(history);
		history.replaceState = (...args) => {
			replaceState(...args);
			record();
		};
		Object.defineProperty(window, "__testRoutes", { value: visited });
	});
	const routes: [string, (page: Page) => Locator][] = [
		["/home", (page) => page.getByRole("tablist")],
		[
			"/home/history",
			(page) => button(page, "New task for this page").first(),
		],
		["/home/new-task", (page) => page.getByPlaceholder("Information")],
		["/home/new-reminder", (page) => page.getByPlaceholder("Message")],
		["/ai", (page) => page.getByPlaceholder("Ask AI")],
		["/profile", (page) => button(page, "Add a profile photo")],
		["/settings", (page) => button(page, "Misc")],
		[
			"/settings/ai",
			(page) => page.getByText("AI Settings", { exact: true }),
		],
		[
			"/settings/misc",
			(page) =>
				page.getByRole("textbox", { name: "Numeric value" }).first(),
		],
		["/export", (page) => button(page, "Export")],
		["/lock", (page) => button(page, "Lock")],
		[
			"/vbm/" + save.id,
			(page) => page.getByPlaceholder("Name", { exact: true }),
		],
		["/task/" + task.id, (page) => page.getByPlaceholder("Information")],
		[
			"/reminder/" + reminder.id,
			(page) => page.getByPlaceholder("Message"),
		],
		["/note/" + note.id, (page) => button(page, "Edit")],
		["/note/new", (page) => page.getByLabel("Note content")],
		[
			pickRoute(AVATAR_REQUEST, "nav-test", "/profile"),
			(page) => page.getByTestId("upload-area"),
		],
		["/getting-started", (page) => button(page, "Skip")],
	];
	for (const [route, ready] of routes) {
		await test.step(route, async () => {
			const page = await openPopup(route);
			await expect(ready(page)).toBeVisible();
			await expect(page).toHaveURL(
				page.url().split("#")[0] + "#" + route,
			);
			const visited = await page.evaluate(
				() =>
					(window as unknown as { __testRoutes: string[] })
						.__testRoutes,
			);
			expect(visited).not.toContain("#/browse-profiles");
			await page.close();
		});
	}
});

test("the intro cannot pull a page back to Home after an immediate departure", async ({
	openPopup,
	context,
	serviceWorker,
}) => {
	const setup = await createProfile(openPopup);
	await setup.close();
	await forgetUIState(serviceWorker);
	await context.addInitScript(() => {
		if (window.location.hash !== "#/") return;
		// Let the intro mount before session hydration. Release the real
		// storage reads as soon as we navigate away from the mounted intro.
		const session = chrome.storage.session;
		const realGet = session.get.bind(session) as (
			key?: string,
		) => Promise<Record<string, unknown>>;
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		session.get = ((key?: string) =>
			key === "unlocked"
				? held.then(() => realGet(key))
				: realGet(key)) as typeof session.get;
		// The intro draws nothing until the session is known, so leave as
		// soon as it is mounted.
		const observer = new MutationObserver(() => {
			const intro = document.getElementById("root")?.firstElementChild;
			if (!intro) return;
			observer.disconnect();
			const appeared = performance.now();
			window.location.hash = "/profile";
			document.documentElement.dataset.departedAfter = String(
				performance.now() - appeared,
			);
			queueMicrotask(release);
		});
		observer.observe(document, { childList: true, subtree: true });
	});
	const page = await openPopup("/");
	await expect(page).toHaveURL(/#\/profile$/);
	await expect(button(page, "Add a profile photo")).toBeVisible();
	const delay = await page
		.locator("html")
		.getAttribute("data-departed-after");
	expect(delay).not.toBeNull();
	expect(Number(delay)).toBeLessThan(100);
	await expect(page.getByPlaceholder("Name", { exact: true })).toHaveValue(
		"Ada",
	);
});

// The page header is a flex item: once History's list appeared under it,
// it shrank, so the logo shrank and the page jumped up after its move.
test("History keeps its header's height once its list appears", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	for (let index = 0; index < 8; index += 1) {
		await seedSave(page, "Visited " + index, false);
	}
	await button(page, "History").click();
	const logo = page.getByRole("img", { name: "Little Later Logo" });
	await expect(page.getByText("Visited 7")).toBeVisible();
	await expect.poll(async () => (await logo.boundingBox())?.height).toBe(48);
	await expect.poll(async () => (await logo.boundingBox())?.y).toBe(8);
});
