import { clerkMiddleware, createRouteMatcher } from "@clerk/astro/server";

/**
 * Protected routes that require authentication
 * Users will be redirected to Clerk sign-in if not authenticated
 */
const isProtectedRoute = createRouteMatcher([
	"/library(.*)",
	"/video/(.*)",
	"/settings(.*)",
]);

/**
 * Clerk middleware for authentication
 *
 * This middleware:
 * - Adds auth() to context.locals for server-side access
 * - Redirects unauthenticated users from protected routes to sign-in
 * - Allows public access to all other routes
 */
export const onRequest = clerkMiddleware((auth, context) => {
	const { pathname } = context.url;

	// Protect specific routes
	if (isProtectedRoute(context.request)) {
		// auth().protect() redirects to sign-in if not authenticated
		auth().protect();
	}
});
