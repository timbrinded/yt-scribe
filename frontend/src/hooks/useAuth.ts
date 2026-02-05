/**
 * Authentication hook for Clerk integration
 *
 * Combines Clerk's authentication state with our backend user data.
 * Uses Clerk for auth state (isSignedIn, getToken) and fetches
 * local user data from /auth/me for the internal user ID.
 */
import { useState, useEffect, useCallback } from "react";
import { useAuth as useClerkAuth } from "@clerk/astro/react";

const API_BASE_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3000";

/**
 * User data returned from our backend (local database)
 */
export interface AuthUser {
	id: number;
	email: string;
	name: string | null;
	avatarUrl: string | null;
}

/**
 * Auth state type
 */
export interface AuthState {
	user: AuthUser | null;
	isLoading: boolean;
	isAuthenticated: boolean;
	error: string | null;
}

/**
 * Auth actions type
 */
export interface AuthActions {
	getToken: () => Promise<string | null>;
	signOut: () => Promise<void>;
}

/**
 * Custom hook for authentication state management
 *
 * Combines Clerk's auth state with backend user data:
 * - Uses Clerk for authentication (isSignedIn, getToken, signOut)
 * - Fetches local user data from /auth/me for internal user ID
 */
export function useAuth(): AuthState & AuthActions {
	const clerkAuth = useClerkAuth();

	const [user, setUser] = useState<AuthUser | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Wrapper for getToken that handles null case
	const getToken = useCallback(async (): Promise<string | null> => {
		try {
			return await clerkAuth.getToken();
		} catch {
			return null;
		}
	}, [clerkAuth]);

	// Fetch local user data from backend
	const fetchLocalUser = useCallback(async () => {
		if (!clerkAuth.isSignedIn) {
			setUser(null);
			setIsLoading(false);
			return;
		}

		try {
			setIsLoading(true);
			setError(null);

			const token = await clerkAuth.getToken();
			if (!token) {
				setUser(null);
				return;
			}

			const response = await fetch(`${API_BASE_URL}/auth/me`, {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (response.status === 401) {
				setUser(null);
				return;
			}

			if (!response.ok) {
				throw new Error("Failed to fetch user data");
			}

			const userData = (await response.json()) as AuthUser;
			setUser(userData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Authentication error");
			setUser(null);
		} finally {
			setIsLoading(false);
		}
	}, [clerkAuth.isSignedIn, clerkAuth]);

	// Fetch local user when Clerk auth state changes
	useEffect(() => {
		if (clerkAuth.isLoaded) {
			fetchLocalUser();
		}
	}, [clerkAuth.isLoaded, clerkAuth.isSignedIn, fetchLocalUser]);

	return {
		user,
		isLoading: !clerkAuth.isLoaded || isLoading,
		isAuthenticated: clerkAuth.isSignedIn === true && user !== null,
		error,
		getToken,
		signOut: async () => {
			await clerkAuth.signOut();
			setUser(null);
		},
	};
}

/**
 * Re-export Clerk useAuth hook for direct access
 */
export { useClerkAuth };

/**
 * Fetch current user data from the API with a token
 * Useful for one-off checks or server-side rendering
 */
export async function fetchCurrentUser(token: string): Promise<AuthUser | null> {
	try {
		const response = await fetch(`${API_BASE_URL}/auth/me`, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (response.status === 401) {
			return null;
		}

		if (!response.ok) {
			throw new Error("Failed to fetch user");
		}

		return (await response.json()) as AuthUser;
	} catch {
		return null;
	}
}
