import { clerkSetup } from "@clerk/testing/playwright";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// ES module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env and .env.test (in frontend directory)
// Note: .env.test overrides .env values for E2E test credentials
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({
	path: path.resolve(__dirname, "../../.env.test"),
	override: true,
});

/**
 * Global setup for Playwright E2E tests using Clerk authentication.
 *
 * This function runs once before all tests and initializes Clerk's testing
 * infrastructure by fetching a testing token from the Clerk Backend API.
 *
 * Required environment variables (from .env or .env.test):
 * - CLERK_SECRET_KEY: Your Clerk secret key (must be from a dev instance)
 * - PUBLIC_CLERK_PUBLISHABLE_KEY: Your Clerk publishable key (Astro convention)
 */
export default async function globalSetup() {
	// @clerk/testing expects CLERK_PUBLISHABLE_KEY, but Astro uses PUBLIC_CLERK_PUBLISHABLE_KEY
	const publishableKey =
		process.env.CLERK_PUBLISHABLE_KEY ||
		process.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
	const secretKey = process.env.CLERK_SECRET_KEY;

	if (!publishableKey || !secretKey) {
		throw new Error(
			"CLERK_PUBLISHABLE_KEY (or PUBLIC_CLERK_PUBLISHABLE_KEY) and CLERK_SECRET_KEY must be set",
		);
	}

	await clerkSetup({
		publishableKey,
		secretKey,
	});
}
