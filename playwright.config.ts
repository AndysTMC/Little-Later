import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/playwright",
	testMatch: "**/*.e2e.ts",
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: {
		timeout: 12_000,
	},
	use: {
		// Its own port, never shared: a server already on it (another
		// project's, an old build's) would be tested instead, as happened
		// with 4173.
		baseURL: "http://127.0.0.1:4175",
		headless: true,
		trace: "retain-on-failure",
	},
	webServer: {
		command: "bun run dev --host 127.0.0.1 --port 4175 --strictPort",
		url: "http://127.0.0.1:4175",
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
