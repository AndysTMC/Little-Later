import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	test as base,
	chromium,
	expect,
	type BrowserContext,
	type Page,
	type Worker,
} from "@playwright/test";

// Fixtures for tests that run the built extension in Chromium.
//
// Each test gets a fresh browser profile with `dist` loaded, so nothing
// (IndexedDB, chrome.storage, alarms) carries over between tests.
//
// Playwright's bundled Chromium is used on purpose: branded Google Chrome
// no longer accepts --load-extension, and the manifest needs Chrome 144 or
// later, which the bundled build satisfies. `channel: "chromium"` selects
// the new headless mode, the only headless mode that runs extensions.

const here = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION_DIR = path.resolve(here, "../../dist");

// Set HEADED=1 to watch a run.
const headless = process.env.HEADED !== "1";

export type CommandResult =
	| { ok: true; value: unknown }
	| { ok: false; error: { code: string; message: string } };

type Fixtures = {
	context: BrowserContext;
	// The extension's service worker as it is right now. After
	// stopServiceWorker() take it again with currentServiceWorker().
	serviceWorker: Worker;
	extensionId: string;
	// Opens an extension page, the popup by default, in a tab. A tab and
	// the toolbar popup load the same index.html; only the window differs.
	openPopup: (hashRoute?: string) => Promise<Page>;
	// Stops the worker the way Chrome does when it is idle, and resolves
	// once it is gone. The next event (a message, an alarm) starts it again.
	stopServiceWorker: (onStopping?: () => Promise<void>) => Promise<void>;
	// The running worker, starting it if it was stopped.
	currentServiceWorker: () => Promise<Worker>;
};

const isExtensionWorker = (worker: Worker) =>
	worker.url().startsWith("chrome-extension://");

export const test = base.extend<Fixtures>({
	// eslint-disable-next-line no-empty-pattern
	context: async ({}, provide) => {
		const context = await chromium.launchPersistentContext("", {
			channel: "chromium",
			headless,
			args: [
				// Browsing fixtures use literal loopback URLs only.
				"--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
				"--no-proxy-server",
				`--disable-extensions-except=${EXTENSION_DIR}`,
				`--load-extension=${EXTENSION_DIR}`,
			],
		});
		await provide(context);
		await context.close();
	},

	serviceWorker: async ({ context }, provide) => {
		const worker =
			context.serviceWorkers().find(isExtensionWorker) ??
			(await context.waitForEvent("serviceworker", isExtensionWorker));
		await provide(worker);
	},

	extensionId: async ({ serviceWorker }, provide) => {
		await provide(new URL(serviceWorker.url()).host);
	},

	openPopup: async ({ context, extensionId }, provide) => {
		await provide(async (hashRoute = "/") => {
			const page = await context.newPage();
			await page.goto(
				`chrome-extension://${extensionId}/index.html#${hashRoute}`,
			);
			return page;
		});
	},

	currentServiceWorker: async ({ context, extensionId }, provide) => {
		await provide(async () => {
			// Any extension event starts a stopped worker; a message from
			// one of its own pages is the simplest.
			const page = await context.newPage();
			await page.goto(
				`chrome-extension://${extensionId}/index.html#/browse-profiles`,
			);
			await page.evaluate(() =>
				chrome.runtime
					.sendMessage({ type: "little/ping" })
					.catch(() => undefined),
			);
			let worker: Worker | undefined;
			await expect
				.poll(async () => {
					worker = context.serviceWorkers().find(isExtensionWorker);
					// A worker that was just stopped can linger in the list
					// for a moment; one that answers is the live one.
					return worker
						? await worker.evaluate(() => true).catch(() => false)
						: false;
				})
				.toBe(true);
			await page.close();
			return worker!;
		});
	},

	stopServiceWorker: async ({ context, extensionId }, provide) => {
		await provide(async (onStopping) => {
			const worker = context.serviceWorkers().find(isExtensionWorker);
			if (!worker) {
				return;
			}
			// Closing the worker's DevTools target stops it as Chrome's own
			// idle timer would: the global scope and everything in memory
			// are discarded, the registration stays, and the next event
			// starts a fresh worker. (ServiceWorker.stopAllWorkers also
			// stops it, but leaves it unable to start again.)
			const page = context
				.pages()
				.find((page) =>
					page
						.url()
						.startsWith("chrome-extension://" + extensionId + "/"),
				);
			if (!page)
				throw new Error(
					"Open an extension page before stopping its worker.",
				);
			const session = await context.newCDPSession(page);
			try {
				const { targetInfos } = await session.send("Target.getTargets");
				const target = targetInfos.find(
					(info) =>
						info.type === "service_worker" &&
						info.url === worker.url(),
				);
				if (!target)
					throw new Error(
						"The extension's service worker is not running.",
					);
				let running = false;
				let stopped = false;
				session.on(
					"ServiceWorker.workerVersionUpdated",
					({ versions }) => {
						const version = versions.find(
							(version) => version.scriptURL === worker.url(),
						);
						if (version?.runningStatus === "running")
							running = true;
						if (running && version?.runningStatus === "stopped")
							stopped = true;
					},
				);
				await session.send("ServiceWorker.enable");
				await expect.poll(() => running).toBe(true);
				const closing = session.send("Target.closeTarget", {
					targetId: target.targetId,
				});
				const overlapping = onStopping?.();
				await closing;
				await expect.poll(() => stopped).toBe(true);
				await overlapping;
			} finally {
				await session.detach();
			}
		});
	},
});

export { expect };

// Sends a worker command from an extension page, as the popup does in a
// production build (src/utils/send.ts).
export const sendCommand = (
	page: Page,
	name: string,
	input: unknown,
): Promise<CommandResult> =>
	page.evaluate(
		([commandName, commandInput]) =>
			chrome.runtime.sendMessage({
				type: "little/command",
				name: commandName,
				input: commandInput,
			}),
		[name, input] as const,
	);

// Creates and unlocks a profile through the popup's own form, and lands on
// the home page. Returns the page.
export const createProfile = async (
	openPopup: Fixtures["openPopup"],
	name = "Ada",
	password?: string,
): Promise<Page> => {
	const page = await openPopup("/new-profile");
	await page.getByLabel("Profile name").fill(name);
	if (password !== undefined) {
		await page.getByLabel("Password", { exact: true }).fill(password);
		await page.getByLabel("Confirm password").fill(password);
	}
	await page.getByRole("button", { name: "Create" }).click();
	// A first profile is shown the guide; skipping it marks it as seen.
	await page.getByRole("button", { name: "Skip" }).click();
	await expect(page.getByRole("tablist")).toBeVisible();
	return page;
};
