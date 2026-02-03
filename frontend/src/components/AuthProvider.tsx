import {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	type ReactNode,
} from "react";

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
 * Auth context value type
 */
interface AuthContextValue {
	user: AuthUser | null;
	isLoading: boolean;
	isAuthenticated: boolean;
	error: string | null;
	checkAuth: () => Promise<void>;
	logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
	children: ReactNode;
}

/**
 * AuthProvider component that wraps the app and provides auth state
 */
export function AuthProvider({ children }: AuthProviderProps) {
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

	const value: AuthContextValue = {
		user,
		isLoading,
		isAuthenticated: !!user,
		error,
		checkAuth,
		logout,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 * Must be used within an AuthProvider
 */
export function useAuthContext(): AuthContextValue {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuthContext must be used within an AuthProvider");
	}
	return context;
}
