import { useState, useEffect, useCallback } from "react";

const API_BASE_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3000";

/**
 * User data returned from auth endpoints
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
	checkAuth: () => Promise<void>;
	logout: () => Promise<void>;
}

/**
 * Custom hook for authentication state management
 * Provides user info, loading state, and auth actions
 */
export function useAuth(): AuthState & AuthActions {
	const [user, setUser] = useState<AuthUser | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const checkAuth = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);

			const response = await fetch(`${API_BASE_URL}/auth/me`, {
				credentials: "include",
			});

			if (response.status === 401) {
				setUser(null);
				return;
			}

			if (!response.ok) {
				throw new Error("Failed to check authentication");
			}

			const userData = (await response.json()) as AuthUser;
			setUser(userData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Authentication error");
			setUser(null);
		} finally {
			setIsLoading(false);
		}
	}, []);

	const logout = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);

			const response = await fetch(`${API_BASE_URL}/auth/logout`, {
				method: "POST",
				credentials: "include",
			});

			if (!response.ok) {
				throw new Error("Failed to logout");
			}

			setUser(null);

			// Redirect to home page after logout
			window.location.href = "/";
		} catch (err) {
			setError(err instanceof Error ? err.message : "Logout error");
		} finally {
			setIsLoading(false);
		}
	}, []);

	// Check auth status on mount
	useEffect(() => {
		checkAuth();
	}, [checkAuth]);

	return {
		user,
		isLoading,
		isAuthenticated: !!user,
		error,
		checkAuth,
		logout,
	};
}

/**
 * Fetch current user data from the API
 * Useful for one-off checks or server-side rendering
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
	try {
		const response = await fetch(`${API_BASE_URL}/auth/me`, {
			credentials: "include",
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
