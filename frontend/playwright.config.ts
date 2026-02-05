import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for E2E testing.
 *
 * The E2E tests run against the Astro dev server (port 4321)
 * which communicates with the backend API (port 3000).
 * Tests are located in tests/e2e/ directory.
 */
export default defineConfig({
	// Global setup for Clerk testing - initializes Clerk testing tokens
	globalSetup: "./tests/e2e/global-setup.ts",

	// Look for test files in tests/e2e directory
	testDir: "./tests/e2e",

	// Run tests in files in parallel
	fullyParallel: true,

	// Fail the build on CI if you accidentally left test.only in the source code
	forbidOnly: !!process.env.CI,

	// Retry on CI only
	retries: process.env.CI ? 2 : 0,

	// Limit parallel workers on CI
	workers: process.env.CI ? 1 : undefined,

	// Reporter to use
	reporter: process.env.CI ? "github" : "list",

	// Shared settings for all projects
	use: {
		// Base URL to use in actions like `await page.goto('/')`
		baseURL: "http://localhost:4321",

		// Collect trace when retrying the failed test
		trace: "on-first-retry",

		// Screenshot on failure
		screenshot: "only-on-failure",
	},

	// Configure projects for major browsers
	projects: [
		// Setup project for authentication
		{
			name: "setup",
			testMatch: /.*\.setup\.ts/,
		},
		// Unauthenticated tests (like home page)
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
			testIgnore: /.*\.auth\.spec\.ts/,
		},
		// Authenticated tests (need login)
		{
			name: "chromium-authenticated",
			use: {
				...devices["Desktop Chrome"],
				// Use saved auth state for authenticated tests
				storageState: ".auth/user.json",
			},
			dependencies: ["setup"],
			testMatch: /.*\.auth\.spec\.ts/,
		},
	],

	// Run both frontend and backend servers before starting tests
	webServer: [
		{
			command: "bun src/effect/main.ts",
			url: "http://localhost:3001/health",
			reuseExistingServer: !process.env.CI,
			timeout: 60 * 1000,
			cwd: "..",
		},
		{
			command: "bun run dev",
			url: "http://localhost:4321",
			reuseExistingServer: !process.env.CI,
			timeout: 120 * 1000,
		},
	],
});
