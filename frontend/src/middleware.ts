import { defineMiddleware } from "astro:middleware";

const API_BASE_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3000";

/**
 * Protected routes that require authentication
 * Users will be redirected to /login if not authenticated
 */
const PROTECTED_ROUTES = ["/library", "/video/", "/settings"];

/**
 * Check if a path matches any protected routes
 */
function isProtectedRoute(path: string): boolean {
	return PROTECTED_ROUTES.some(
		(route) => path === route || path.startsWith(route),
	);
}

/**
 * Astro middleware for authentication
 * Checks session cookie and redirects to login for protected routes
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = context.url;

	// Skip auth check for non-protected routes
	if (!isProtectedRoute(pathname)) {
		return next();
	}

	// Get session cookie from request
	const sessionCookie = context.cookies.get("session");

	if (!sessionCookie?.value) {
		// No session cookie, redirect to login
		return context.redirect("/login");
	}

	// Validate session with backend
	try {
		const response = await fetch(`${API_BASE_URL}/auth/me`, {
			headers: {
				Cookie: `session=${sessionCookie.value}`,
			},
		});

		if (response.status === 401) {
			// Invalid or expired session, redirect to login
			return context.redirect("/login");
		}

		if (!response.ok) {
			// Server error, let the page handle it
			return next();
		}

		// Valid session, allow access to protected route
		// Store user data in locals for potential server-side use
		const user = await response.json();
		context.locals.user = user;
	} catch {
		// Network error, let the page handle it with client-side auth
		// Don't block access on network failures
	}

	return next();
});
