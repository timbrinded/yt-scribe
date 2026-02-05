import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Global setup for Playwright E2E tests using Clerk authentication.
 *
 * This function runs once before all tests and initializes Clerk's testing
 * infrastructure by fetching a testing token from the Clerk Backend API.
 *
 * Required environment variables (from .env.test):
 * - CLERK_SECRET_KEY: Your Clerk secret key (must be from a dev instance)
 * - PUBLIC_CLERK_PUBLISHABLE_KEY: Your Clerk publishable key
 */
export default async function globalSetup() {
	await clerkSetup();
}
