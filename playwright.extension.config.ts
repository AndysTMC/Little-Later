import { defineConfig } from "@playwright/test";

// End-to-end tests against the built extension (decision 0012): the real
// service worker, runtime messaging, chrome.storage.session, OPFS staging
// and alarms. `bun run test:ext` builds `dist` first. The other Playwright
// suite (playwright.config.ts) drives the popup on the dev server, where
// commands run in the page and none of those are exercised.
export default defineConfig({
	testDir: "./tests/extension",
	testMatch: "**/*.ext.ts",
	// One browser profile per test, so tests do not share state; one worker
	// keeps a laptop responsive and the alarms and idle timing predictable.
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
	use: {
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
});
