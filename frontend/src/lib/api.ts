/**
 * API utilities with Clerk authentication
 *
 * Provides authenticated fetch functions using Clerk's session tokens.
 */

const API_BASE_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3001";

/**
 * Custom fetch error with status code
 */
export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
		this.name = "ApiError";
	}
}

/**
 * Get the Clerk session token for authenticated API calls.
 * Tries multiple methods to get the token from Clerk.
 */
async function getClerkToken(): Promise<string | null> {
	if (typeof window === "undefined") {
		return null;
	}

	// Wait for Clerk to be fully loaded with an active session (max 15 seconds)
	const waitForClerkSession = async (): Promise<any> => {
		const maxWait = 15000;
		const interval = 100;
		let waited = 0;

		while (waited < maxWait) {
			const clerk = (window as any).Clerk;
			// Wait until Clerk is loaded AND has a session
			if (clerk?.loaded && clerk?.session) {
				return clerk;
			}
			await new Promise((resolve) => setTimeout(resolve, interval));
			waited += interval;
		}
		return (window as any).Clerk ?? null;
	};

	try {
		const clerk = await waitForClerkSession();
		if (!clerk) {
			console.warn("[getClerkToken] Clerk not available");
			return null;
		}

		// Method 1: Try window.Clerk.session.getToken() (primary method)
		if (clerk.session?.getToken) {
			const token = await clerk.session.getToken();
			if (token) return token;
		}

		// Method 2: Try to get session from clerk.client.sessions
		if (clerk.client?.sessions) {
			const sessions = clerk.client.sessions;
			for (const session of sessions) {
				if (session.status === "active" && session.getToken) {
					const token = await session.getToken();
					if (token) return token;
				}
			}
		}

		// Method 3: If user exists, try to get any active session
		if (clerk.user && clerk.client?.activeSessions) {
			for (const session of clerk.client.activeSessions) {
				if (session.getToken) {
					const token = await session.getToken();
					if (token) return token;
				}
			}
		}

		console.warn("[getClerkToken] No token found despite Clerk being loaded");
	} catch (e) {
		console.error("Error getting Clerk token:", e);
	}
	return null;
}

/**
 * Authenticated fetch wrapper that adds Clerk JWT to requests.
 *
 * @param path - API path (e.g., "/api/videos")
 * @param options - Fetch options
 * @returns Fetch response
 * @throws ApiError on non-2xx responses
 *
 * @example
 * ```typescript
 * const data = await apiFetch("/api/videos");
 * ```
 */
export async function apiFetch(
	path: string,
	options: RequestInit = {},
): Promise<Response> {
	const token = await getClerkToken();

	const headers: HeadersInit = {
		...options.headers,
	};

	if (token) {
		(headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
	}

	const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;

	const response = await fetch(url, {
		...options,
		headers,
	});

	return response;
}

/**
 * Authenticated fetch that returns JSON data.
 *
 * @param path - API path
 * @param options - Fetch options
 * @returns Parsed JSON response
 * @throws ApiError on non-2xx responses
 */
export async function apiFetchJson<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const response = await apiFetch(path, options);

	if (!response.ok) {
		throw new ApiError(`API error: ${response.statusText}`, response.status);
	}

	return response.json() as Promise<T>;
}

/**
 * POST JSON data with authentication.
 */
export async function apiPost<T>(
	path: string,
	data: unknown,
	options: RequestInit = {},
): Promise<T> {
	return apiFetchJson<T>(path, {
		...options,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...options.headers,
		},
		body: JSON.stringify(data),
	});
}

/**
 * DELETE with authentication.
 */
export async function apiDelete(
	path: string,
	options: RequestInit = {},
): Promise<Response> {
	return apiFetch(path, {
		...options,
		method: "DELETE",
	});
}

// Type declaration for Clerk on window
declare global {
	interface Window {
		Clerk?: {
			session?: {
				getToken: () => Promise<string | null>;
			};
		};
	}
}
