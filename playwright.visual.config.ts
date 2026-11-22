import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/playwright",
	testMatch: "visual-tour.ts",
	fullyParallel: false,
	workers: 1,
	timeout: 180_000,
	use: {
		// Its own port, never shared: a server already on it (the e2e
		// suite's, another project's) would be photographed instead.
		baseURL: "http://127.0.0.1:4174",
		...(process.env.PLAYWRIGHT_CHANNEL
			? { channel: process.env.PLAYWRIGHT_CHANNEL }
			: {}),
		headless: true,
		viewport: { width: 500, height: 600 },
		deviceScaleFactor: 1,
	},
	webServer: {
		command: "bun run dev --host 127.0.0.1 --port 4174 --strictPort",
		url: "http://127.0.0.1:4174",
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
