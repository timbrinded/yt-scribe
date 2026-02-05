import { execSync } from "child_process";

/**
 * Global teardown for Playwright E2E tests.
 *
 * This ensures orphan processes are cleaned up after tests complete,
 * even if the tests fail or are interrupted. This prevents dangling
 * services from occupying ports between test runs.
 */
export default async function globalTeardown() {
	// Only perform aggressive cleanup in CI where we started the servers
	// In local development, reuseExistingServer may be keeping servers alive intentionally
	if (process.env.CI) {
		try {
			// Kill any orphan processes on our ports
			// Using SIGTERM first for graceful shutdown
			execSync("lsof -ti :3001 | xargs kill -15 2>/dev/null || true", { stdio: "ignore" });
			execSync("lsof -ti :4321 | xargs kill -15 2>/dev/null || true", { stdio: "ignore" });

			// Give processes time to gracefully shutdown
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Force kill if still running
			execSync("lsof -ti :3001 | xargs kill -9 2>/dev/null || true", { stdio: "ignore" });
			execSync("lsof -ti :4321 | xargs kill -9 2>/dev/null || true", { stdio: "ignore" });
		} catch {
			// Ignore errors - processes may already be dead
		}
	}
}
