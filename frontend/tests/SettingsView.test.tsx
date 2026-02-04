import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "../src/components/SettingsView";

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
	m: {
		div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
			<div {...props}>{children}</div>
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
global.fetch = mockFetch;

// Mock window.location
const mockLocation = { href: "" };
Object.defineProperty(window, "location", {
	value: mockLocation,
	writable: true,
});

describe("SettingsView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLocation.href = "";
	});

	describe("Loading state", () => {
		it("shows loading skeleton while fetching user data", () => {
			mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolve
			render(<SettingsView />);

			// Check for skeleton elements
			expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
		});
	});

	describe("Error state", () => {
		it("shows error message when fetch fails", async () => {
			mockFetch.mockRejectedValue(new Error("Network error"));
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByText("Network error")).toBeInTheDocument();
			});
		});

		it("shows Try Again button on error", async () => {
			mockFetch.mockRejectedValue(new Error("Network error"));
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
			});
		});
	});

	describe("Authenticated state", () => {
		const mockUser = {
			id: 1,
			email: "test@example.com",
			name: "Test User",
			avatarUrl: "https://example.com/avatar.jpg",
		};

		beforeEach(() => {
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => mockUser,
			});
		});

		it("displays user profile information", async () => {
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByText("Test User")).toBeInTheDocument();
				expect(screen.getByText("test@example.com")).toBeInTheDocument();
			});
		});

		it("shows user avatar when provided", async () => {
			render(<SettingsView />);

			await waitFor(() => {
				const avatar = screen.getByAltText("Test User");
				expect(avatar).toBeInTheDocument();
				expect(avatar).toHaveAttribute("src", mockUser.avatarUrl);
			});
		});

		it("shows initials when no avatar URL", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({ ...mockUser, avatarUrl: null }),
			});

			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByText("TU")).toBeInTheDocument();
			});
		});

		it("shows Settings heading", async () => {
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
			});
		});

		it("shows Profile section", async () => {
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
			});
		});

		it("shows Account section", async () => {
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
			});
		});

		it("shows Danger Zone section", async () => {
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("heading", { name: "Danger Zone" })).toBeInTheDocument();
			});
		});

		it("shows sign out button", async () => {
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
			});
		});

		it("shows delete account button", async () => {
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();
			});
		});
	});

	describe("Logout functionality", () => {
		const mockUser = {
			id: 1,
			email: "test@example.com",
			name: "Test User",
			avatarUrl: null,
		};

		beforeEach(() => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => mockUser,
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({ message: "Logged out successfully" }),
				});
		});

		it("calls logout endpoint when sign out clicked", async () => {
			const user = userEvent.setup();
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
			});

			await user.click(screen.getByRole("button", { name: "Sign out" }));

			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledWith(
					expect.stringContaining("/auth/logout"),
					expect.objectContaining({ method: "POST" })
				);
			});
		});

		it("redirects to home after successful logout", async () => {
			const user = userEvent.setup();
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
			});

			await user.click(screen.getByRole("button", { name: "Sign out" }));

			await waitFor(() => {
				expect(mockLocation.href).toBe("/");
			});
		});
	});

	describe("Account deletion", () => {
		const mockUser = {
			id: 1,
			email: "test@example.com",
			name: "Test User",
			avatarUrl: null,
		};

		beforeEach(() => {
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => mockUser,
			});
		});

		it("opens delete confirmation modal when delete button clicked", async () => {
			const user = userEvent.setup();
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();
			});

			await user.click(screen.getByRole("button", { name: "Delete account" }));

			await waitFor(() => {
				expect(screen.getByText("Delete your account?")).toBeInTheDocument();
			});
		});

		it("shows confirmation input in modal", async () => {
			const user = userEvent.setup();
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();
			});

			await user.click(screen.getByRole("button", { name: "Delete account" }));

			await waitFor(() => {
				expect(screen.getByPlaceholderText("DELETE")).toBeInTheDocument();
			});
		});

		it("disables delete button until DELETE is typed", async () => {
			const user = userEvent.setup();
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();
			});

			await user.click(screen.getByRole("button", { name: "Delete account" }));

			await waitFor(() => {
				const deleteButtons = screen.getAllByRole("button", { name: /Delete account/i });
				const modalDeleteButton = deleteButtons[deleteButtons.length - 1];
				expect(modalDeleteButton).toBeDisabled();
			});
		});

		it("enables delete button when DELETE is typed", async () => {
			const user = userEvent.setup();
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();
			});

			await user.click(screen.getByRole("button", { name: "Delete account" }));

			await waitFor(() => {
				expect(screen.getByPlaceholderText("DELETE")).toBeInTheDocument();
			});

			await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");

			await waitFor(() => {
				const deleteButtons = screen.getAllByRole("button", { name: /Delete account/i });
				const modalDeleteButton = deleteButtons[deleteButtons.length - 1];
				expect(modalDeleteButton).not.toBeDisabled();
			});
		});

		it("closes modal when cancel is clicked", async () => {
			const user = userEvent.setup();
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();
			});

			await user.click(screen.getByRole("button", { name: "Delete account" }));

			await waitFor(() => {
				expect(screen.getByText("Delete your account?")).toBeInTheDocument();
			});

			await user.click(screen.getByRole("button", { name: "Cancel" }));

			await waitFor(() => {
				expect(screen.queryByText("Delete your account?")).not.toBeInTheDocument();
			});
		});

		it("calls delete endpoint when confirmed", async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => mockUser,
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({ message: "Account deleted successfully" }),
				});

			const user = userEvent.setup();
			render(<SettingsView />);

			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();
			});

			await user.click(screen.getByRole("button", { name: "Delete account" }));

			await waitFor(() => {
				expect(screen.getByPlaceholderText("DELETE")).toBeInTheDocument();
			});

			await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");

			const deleteButtons = screen.getAllByRole("button", { name: /Delete account/i });
			const modalDeleteButton = deleteButtons[deleteButtons.length - 1];
			await user.click(modalDeleteButton);

			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledWith(
					expect.stringContaining("/auth/account"),
					expect.objectContaining({ method: "DELETE" })
				);
			});
		});
	});

	describe("Unauthorized redirect", () => {
		it("redirects to login when unauthorized", async () => {
			mockFetch.mockResolvedValue({
				ok: false,
				status: 401,
			});

			render(<SettingsView />);

			await waitFor(() => {
				expect(mockLocation.href).toBe("/login");
			});
		});
	});
});
