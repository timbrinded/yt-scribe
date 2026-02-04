import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",
	use: {
		baseURL: BASE_URL,
		trace: "on-first-retry",
	},
	projects: [
		// Setup project runs first and creates authenticated state
		{ name: "setup", testMatch: /.*\.setup\.ts/ },
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				// Use saved auth state for all tests
				storageState: ".auth/user.json",
			},
			dependencies: ["setup"],
		},
	],
	// Start the backend server before running tests
	webServer: {
		command: "bun run src/server.ts",
		url: `${BASE_URL}/health`,
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});
