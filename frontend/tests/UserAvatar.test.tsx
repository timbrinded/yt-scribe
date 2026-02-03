import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { UserAvatar } from "../src/components/UserAvatar";

// Mock framer-motion
vi.mock("framer-motion", () => ({
	m: {
		div: ({
			children,
			className,
			...props
		}: {
			children: React.ReactNode;
			className?: string;
		}) => (
			<div className={className} {...props}>
				{children}
			</div>
		),
	},
	AnimatePresence: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

// Mock MotionWrapper
vi.mock("../src/components/MotionWrapper", () => ({
	MotionWrapper: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("UserAvatar component", () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	test("should show loading state initially", () => {
		mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
		render(<UserAvatar />);

		const loading = document.querySelector(".animate-pulse");
		expect(loading).not.toBeNull();
	});

	test("should show sign in button when not authenticated", async () => {
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({ error: "Not authenticated" }), {
				status: 401,
			}),
		);

		render(<UserAvatar />);

		await waitFor(() => {
			expect(screen.getByText("Sign In")).toBeTruthy();
		});
	});

	test("should link to login page when not authenticated", async () => {
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({ error: "Not authenticated" }), {
				status: 401,
			}),
		);

		render(<UserAvatar />);

		await waitFor(() => {
			const signInLink = screen.getByText("Sign In");
			expect(signInLink.closest("a")).toHaveProperty("href");
			expect(signInLink.closest("a")?.getAttribute("href")).toBe("/login");
		});
	});

	test("should show user avatar when authenticated", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 1,
					email: "test@example.com",
					name: "Test User",
					avatarUrl: "https://example.com/avatar.jpg",
				}),
				{ status: 200 },
			),
		);

		render(<UserAvatar />);

		await waitFor(() => {
			const avatar = screen.getByRole("img");
			expect(avatar).toBeTruthy();
			expect(avatar.getAttribute("src")).toBe("https://example.com/avatar.jpg");
		});
	});

	test("should show initials when no avatar URL", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 1,
					email: "test@example.com",
					name: "Test User",
					avatarUrl: null,
				}),
				{ status: 200 },
			),
		);

		render(<UserAvatar />);

		await waitFor(() => {
			expect(screen.getByText("TU")).toBeTruthy();
		});
	});

	test("should toggle dropdown when avatar clicked", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 1,
					email: "test@example.com",
					name: "Test User",
					avatarUrl: null,
				}),
				{ status: 200 },
			),
		);

		render(<UserAvatar />);

		await waitFor(() => {
			expect(screen.getByText("TU")).toBeTruthy();
		});

		const avatarButton = screen.getByRole("button", {
			name: /open user menu/i,
		});
		fireEvent.click(avatarButton);

		await waitFor(() => {
			expect(screen.getByText("test@example.com")).toBeTruthy();
		});
	});

	test("should show user email in dropdown", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 1,
					email: "john@example.com",
					name: "John Doe",
					avatarUrl: null,
				}),
				{ status: 200 },
			),
		);

		render(<UserAvatar />);

		await waitFor(() => {
			expect(screen.getByText("JD")).toBeTruthy();
		});

		const avatarButton = screen.getByRole("button", {
			name: /open user menu/i,
		});
		fireEvent.click(avatarButton);

		await waitFor(() => {
			expect(screen.getByText("john@example.com")).toBeTruthy();
			expect(screen.getByText("John Doe")).toBeTruthy();
		});
	});

	test("should have my library link in dropdown", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 1,
					email: "test@example.com",
					name: "Test User",
					avatarUrl: null,
				}),
				{ status: 200 },
			),
		);

		render(<UserAvatar />);

		await waitFor(() => {
			expect(screen.getByText("TU")).toBeTruthy();
		});

		const avatarButton = screen.getByRole("button", {
			name: /open user menu/i,
		});
		fireEvent.click(avatarButton);

		await waitFor(() => {
			const libraryLink = screen.getByText("My Library");
			expect(libraryLink.closest("a")?.getAttribute("href")).toBe("/library");
		});
	});

	test("should have settings link in dropdown", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 1,
					email: "test@example.com",
					name: "Test User",
					avatarUrl: null,
				}),
				{ status: 200 },
			),
		);

		render(<UserAvatar />);

		await waitFor(() => {
			expect(screen.getByText("TU")).toBeTruthy();
		});

		const avatarButton = screen.getByRole("button", {
			name: /open user menu/i,
		});
		fireEvent.click(avatarButton);

		await waitFor(() => {
			const settingsLink = screen.getByText("Settings");
			expect(settingsLink.closest("a")?.getAttribute("href")).toBe("/settings");
		});
	});

	test("should have sign out button in dropdown", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 1,
					email: "test@example.com",
					name: "Test User",
					avatarUrl: null,
				}),
				{ status: 200 },
			),
		);

		render(<UserAvatar />);

		await waitFor(() => {
			expect(screen.getByText("TU")).toBeTruthy();
		});

		const avatarButton = screen.getByRole("button", {
			name: /open user menu/i,
		});
		fireEvent.click(avatarButton);

		await waitFor(() => {
			expect(screen.getByText("Sign out")).toBeTruthy();
		});
	});

	test("should apply custom className", async () => {
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({ error: "Not authenticated" }), {
				status: 401,
			}),
		);

		render(<UserAvatar className="custom-class" />);

		await waitFor(() => {
			const signInLink = screen.getByText("Sign In");
			expect(signInLink.className).toContain("custom-class");
		});
	});
});
