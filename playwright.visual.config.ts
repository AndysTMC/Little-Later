import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/playwright",
	testMatch: "visual-tour.ts",
	fullyParallel: false,
	workers: 1,
	timeout: 180_000,
	use: {
		baseURL: "http://127.0.0.1:4173",
		channel: "chrome",
		headless: true,
		viewport: { width: 500, height: 600 },
		deviceScaleFactor: 1,
	},
	webServer: {
		command: "bun run dev --host 127.0.0.1 --port 4173",
		url: "http://127.0.0.1:4173",
		reuseExistingServer: true,
		timeout: 120_000,
	},
});
