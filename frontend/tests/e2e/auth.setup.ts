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
 *
 * This setup runs before any authenticated tests (*.auth.spec.ts files).
 */
setup("authenticate", async ({ page }) => {
	// Run the Bun script to create test user and session
	// The script is in the parent directory (project root)
	const output = execSync("bun e2e/helpers/create-test-session.ts", {
		encoding: "utf-8",
		cwd: "..",
	});

	const session: TestSession = JSON.parse(output.trim());

	// Navigate to the backend first to set the cookie on that origin
	await page.goto("http://localhost:3000/health");

	// Set the session cookie for localhost (covers both ports)
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

	// Verify authentication works by hitting the backend /auth/me endpoint
	const response = await page.request.get("http://localhost:3000/auth/me");
	const status = response.status();
	const body = await response.text();

	if (!response.ok()) {
		console.error(`Auth check failed: status=${status}, body=${body}`);
		console.error(`Session token: ${session.token.substring(0, 10)}...`);
		const cookies = await page.context().cookies();
		console.error(`Cookies: ${JSON.stringify(cookies)}`);
	}

	expect(response.ok()).toBeTruthy();

	const userData = JSON.parse(body);
	expect(userData.email).toBe(session.user.email);

	// Now navigate to the frontend to also establish that origin
	await page.goto("http://localhost:4321");

	// Save the authenticated state for other tests to use
	await page.context().storageState({ path: authFile });

	console.log(`Frontend auth setup complete for user: ${userData.email}`);
});
