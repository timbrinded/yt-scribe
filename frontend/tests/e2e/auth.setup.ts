import { test as setup, expect } from "@playwright/test";
import { clerkSetup } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

const authFile = ".auth/user.json";

// Setup must run serially (required for Clerk testing)
setup.describe.configure({ mode: "serial" });

/**
 * Initialize Clerk testing token.
 * This must run before authentication.
 */
setup("initialize clerk", async ({}) => {
	await clerkSetup();
});

/**
 * Setup authentication using Clerk Backend API for E2E tests.
 *
 * This setup creates a sign-in token using the Clerk Backend API to bypass
 * device verification and other security checks that block automated testing.
 *
 * Required environment variables (from .env.test):
 * - E2E_CLERK_USER_USERNAME: Test user email
 * - CLERK_SECRET_KEY: Your Clerk secret key
 * - CLERK_PUBLISHABLE_KEY: Your Clerk publishable key
 */
setup("authenticate", async ({ page }) => {
	const username = process.env.E2E_CLERK_USER_USERNAME;
	const secretKey = process.env.CLERK_SECRET_KEY;
	const publishableKey =
		process.env.CLERK_PUBLISHABLE_KEY ||
		process.env.PUBLIC_CLERK_PUBLISHABLE_KEY;

	if (!username || !secretKey) {
		throw new Error(
			"E2E_CLERK_USER_USERNAME and CLERK_SECRET_KEY must be set in .env.test",
		);
	}

	// Create a Clerk client
	const clerk = createClerkClient({ secretKey });

	// Find the user by email
	const users = await clerk.users.getUserList({
		emailAddress: [username],
	});

	if (users.data.length === 0) {
		throw new Error(`Test user with email ${username} not found in Clerk`);
	}

	const user = users.data[0];

	// Create a sign-in token for the user
	const signInToken = await clerk.signInTokens.createSignInToken({
		userId: user.id,
		expiresInSeconds: 300, // 5 minutes
	});

	// Extract the Frontend API URL from the publishable key
	// Format: pk_test_<base64-encoded-url>
	const frontendApi = publishableKey
		? Buffer.from(publishableKey.replace(/^pk_(test|live)_/, ""), "base64")
				.toString("utf-8")
				.replace(/\$$/, "") // Remove trailing $
		: null;

	if (!frontendApi) {
		throw new Error("Could not determine Frontend API from publishable key");
	}

	// Navigate to the sign-in token URL to authenticate
	// This creates a session without needing password or device verification
	const signInUrl = `https://${frontendApi}/v1/sign_in_tokens/${signInToken.token}/accept`;

	// First, navigate to the app to establish cookies domain
	await page.goto("/");
	await page.waitForLoadState("networkidle");

	// Use the sign-in token via Clerk's client-side method
	// We need to call Clerk's signIn.create with the ticket
	await page.evaluate(
		async ({ token }) => {
			// Wait for Clerk to be available
			const waitForClerk = () =>
				new Promise<void>((resolve) => {
					const check = () => {
						if ((window as any).Clerk?.client) {
							resolve();
						} else {
							setTimeout(check, 100);
						}
					};
					check();
				});

			await waitForClerk();
			const clerk = (window as any).Clerk;

			// Create a sign-in with the token
			const signIn = await clerk.client.signIn.create({
				strategy: "ticket",
				ticket: token,
			});

			// Set the active session
			await clerk.setActive({ session: signIn.createdSessionId });
		},
		{ token: signInToken.token },
	);

	// Wait for session to be established
	await page.waitForTimeout(1000);

	// Navigate to /library and verify we're authenticated
	await page.goto("/library");
	await page.waitForLoadState("networkidle");

	// Verify we're authenticated by checking we're not redirected to sign-in
	// (the URL should still be /library, and we should see authenticated UI elements)
	await expect(page).toHaveURL(/.*\/library/);

	// Also verify we're not on the sign-in page
	await expect(
		page.getByRole("heading", { name: /sign in/i }),
	).not.toBeVisible();

	// Save the authenticated state for other tests to use
	await page.context().storageState({ path: authFile });

	console.log(`Auth setup complete for user: ${username}`);
});
