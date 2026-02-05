import { test as setup, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

const authFile = ".auth/user.json";

/**
 * Setup authentication using @clerk/testing for E2E tests.
 *
 * This setup runs before any authenticated tests (*.auth.spec.ts files).
 * It uses Clerk's testing helpers to sign in with username/password,
 * then saves the storage state for reuse.
 *
 * Required environment variables (from .env.test):
 * - E2E_CLERK_USER_USERNAME: Test user email
 * - E2E_CLERK_USER_PASSWORD: Test user password
 * - CLERK_SECRET_KEY: Your Clerk secret key
 * - PUBLIC_CLERK_PUBLISHABLE_KEY: Your Clerk publishable key
 */
setup("authenticate", async ({ page }) => {
	const username = process.env.E2E_CLERK_USER_USERNAME;
	const password = process.env.E2E_CLERK_USER_PASSWORD;

	if (!username || !password) {
		throw new Error(
			"E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD must be set in .env.test"
		);
	}

	// Navigate to a page that loads Clerk (required before calling clerk.signIn)
	await page.goto("/");

	// Sign in using Clerk's testing helper with password strategy
	await clerk.signIn({
		page,
		signInParams: {
			strategy: "password",
			identifier: username,
			password: password,
		},
	});

	// Navigate to /library and verify we're authenticated
	await page.goto("/library");
	await expect(page.getByRole("heading", { name: /library/i })).toBeVisible();

	// Save the authenticated state for other tests to use
	await page.context().storageState({ path: authFile });

	console.log(`Auth setup complete for user: ${username}`);
});
