import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAuth, fetchCurrentUser } from "../src/hooks/useAuth";

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("useAuth hook", () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	test("should start with loading state", () => {
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({}), { status: 401 }),
		);
		const { result } = renderHook(() => useAuth());

		expect(result.current.isLoading).toBe(true);
	});

	test("should set user when authenticated", async () => {
		const mockUser = {
			id: 1,
			email: "test@example.com",
			name: "Test User",
			avatarUrl: "https://example.com/avatar.jpg",
		};

		mockFetch.mockResolvedValue(
			new Response(JSON.stringify(mockUser), { status: 200 }),
		);

		const { result } = renderHook(() => useAuth());

		await waitFor(() => expect(result.current.isLoading).toBe(false));

		expect(result.current.user).toEqual(mockUser);
		expect(result.current.isAuthenticated).toBe(true);
		expect(result.current.error).toBeNull();
	});

	test("should set user to null when not authenticated", async () => {
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({ error: "Not authenticated" }), {
				status: 401,
			}),
		);

		const { result } = renderHook(() => useAuth());

		await waitFor(() => expect(result.current.isLoading).toBe(false));

		expect(result.current.user).toBeNull();
		expect(result.current.isAuthenticated).toBe(false);
		expect(result.current.error).toBeNull();
	});

	test("should handle fetch error", async () => {
		mockFetch.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useAuth());

		await waitFor(() => expect(result.current.isLoading).toBe(false));

		expect(result.current.user).toBeNull();
		expect(result.current.isAuthenticated).toBe(false);
		expect(result.current.error).toBe("Network error");
	});

	test("should call /auth/me endpoint", async () => {
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({}), { status: 401 }),
		);

		renderHook(() => useAuth());

		await waitFor(() => expect(mockFetch).toHaveBeenCalled());

		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining("/auth/me"),
			expect.objectContaining({ credentials: "include" }),
		);
	});
});

describe("fetchCurrentUser function", () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	test("should return user when authenticated", async () => {
		const mockUser = {
			id: 1,
			email: "test@example.com",
			name: "Test User",
			avatarUrl: null,
		};

		mockFetch.mockResolvedValue(
			new Response(JSON.stringify(mockUser), { status: 200 }),
		);

		const result = await fetchCurrentUser();

		expect(result).toEqual(mockUser);
	});

	test("should return null when not authenticated", async () => {
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({ error: "Not authenticated" }), {
				status: 401,
			}),
		);

		const result = await fetchCurrentUser();

		expect(result).toBeNull();
	});

	test("should return null on error", async () => {
		mockFetch.mockRejectedValue(new Error("Network error"));

		const result = await fetchCurrentUser();

		expect(result).toBeNull();
	});
});
