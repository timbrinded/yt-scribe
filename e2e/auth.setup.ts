import { test as setup, expect } from "@playwright/test";
import { execSync } from "node:child_process";

const authFile = ".auth/user.json";

interface TestSession {
	token: string;
	user: {
		id: number;
		email: string;
		name: string;
	};
	expiresAt: string;
}

/**
 * Setup authentication by calling a Bun helper script to create a test user
 * and session in the database, then storing the session cookie for all tests.
 */
setup("authenticate", async ({ page, baseURL }) => {
	// Run the Bun script to create test user and session
	const output = execSync("bun e2e/helpers/create-test-session.ts", {
		encoding: "utf-8",
		cwd: process.cwd(),
	});

	const session: TestSession = JSON.parse(output.trim());

	// Navigate to the app to establish the origin
	await page.goto(baseURL ?? "http://localhost:3000");

	// Set the session cookie directly
	const expiresDate = new Date(session.expiresAt);
	await page.context().addCookies([
		{
			name: "session",
			value: session.token,
			domain: "localhost",
			path: "/",
			httpOnly: true,
			secure: false, // false for localhost
			sameSite: "Lax",
			expires: Math.floor(expiresDate.getTime() / 1000),
		},
	]);

	// Verify authentication works by hitting the /auth/me endpoint
	const response = await page.request.get("/auth/me");
	expect(response.ok()).toBeTruthy();

	const userData = await response.json();
	expect(userData.email).toBe(session.user.email);

	// Save the authenticated state for other tests to use
	await page.context().storageState({ path: authFile });

	console.log(`Auth setup complete for user: ${userData.email}`);
});
