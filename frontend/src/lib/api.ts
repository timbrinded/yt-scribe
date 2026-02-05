/**
 * API utilities with Clerk authentication
 *
 * Provides authenticated fetch functions using Clerk's session tokens.
 */

const API_BASE_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3000";

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
 * Uses the Clerk JavaScript SDK's global method.
 */
async function getClerkToken(): Promise<string | null> {
	// Access Clerk's session token from the global Clerk object
	// This is set by @clerk/astro when running in the browser
	if (typeof window !== "undefined" && window.Clerk) {
		try {
			const session = window.Clerk.session;
			if (session) {
				return await session.getToken();
			}
		} catch {
			return null;
		}
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
		throw new ApiError(
			`API error: ${response.statusText}`,
			response.status,
		);
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
