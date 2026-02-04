import { test, expect } from "@playwright/test";

test.describe("authenticated API tests", () => {
	test("GET /auth/me returns current user", async ({ request }) => {
		const response = await request.get("/auth/me");

		expect(response.ok()).toBeTruthy();

		const user = await response.json();
		expect(user.email).toBe("e2e-test@example.com");
		expect(user.name).toBe("E2E Test User");
	});

	test("GET /health returns ok status", async ({ request }) => {
		const response = await request.get("/health");

		expect(response.ok()).toBeTruthy();

		const health = await response.json();
		expect(health.status).toBe("ok");
	});

	test("POST /auth/logout clears session", async ({ request }) => {
		// Verify we're authenticated first
		const authCheck = await request.get("/auth/me");
		expect(authCheck.ok()).toBeTruthy();

		// Logout
		const logoutResponse = await request.post("/auth/logout");
		expect(logoutResponse.ok()).toBeTruthy();

		// After logout, /auth/me should return 401
		// Note: We need a fresh context since cookies persist in the test
		const afterLogout = await request.get("/auth/me");
		expect(afterLogout.status()).toBe(401);
	});
});

test.describe("unauthenticated access", () => {
	// This test runs without auth state
	test.use({ storageState: { cookies: [], origins: [] } });

	test("GET /auth/me returns 401 when not authenticated", async ({
		request,
	}) => {
		const response = await request.get("/auth/me");

		expect(response.status()).toBe(401);
	});
});
