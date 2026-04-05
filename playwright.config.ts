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
		baseURL: "http://127.0.0.1:4173",
		headless: true,
		trace: "retain-on-failure",
	},
	webServer: {
		command: "bun run dev --host 127.0.0.1 --port 4173",
		url: "http://127.0.0.1:4173",
		reuseExistingServer: true,
		timeout: 120_000,
	},
});

