import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddVideoModal } from "../src/components/AddVideoModal";

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
	m: {
		div: ({
			children,
			className,
			onClick,
			"data-testid": testId,
		}: {
			children: React.ReactNode;
			className?: string;
			onClick?: (e: React.MouseEvent) => void;
			"data-testid"?: string;
		}) => (
			<div className={className} onClick={onClick} data-testid={testId}>
				{children}
			</div>
		),
		p: ({
			children,
			className,
			"data-testid": testId,
		}: {
			children: React.ReactNode;
			className?: string;
			"data-testid"?: string;
		}) => (
			<p className={className} data-testid={testId}>
				{children}
			</p>
		),
	},
	AnimatePresence: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

// Mock MotionWrapper to just render children
vi.mock("../src/components/MotionWrapper", () => ({
	MotionWrapper: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

describe("AddVideoModal", () => {
	const defaultProps = {
		isOpen: true,
		onClose: vi.fn(),
		onSuccess: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("renders modal when isOpen is true", () => {
		render(<AddVideoModal {...defaultProps} />);

		expect(screen.getByTestId("add-video-modal")).toBeDefined();
		expect(screen.getByRole("heading", { name: "Add Video" })).toBeDefined();
		expect(screen.getByTestId("youtube-url-input")).toBeDefined();
	});

	test("does not render modal when isOpen is false", () => {
		render(<AddVideoModal {...defaultProps} isOpen={false} />);

		expect(screen.queryByTestId("add-video-modal")).toBeNull();
	});

	test("displays input field for YouTube URL", () => {
		render(<AddVideoModal {...defaultProps} />);

		const input = screen.getByTestId("youtube-url-input");
		expect(input).toBeDefined();
		expect(input.getAttribute("placeholder")).toContain("youtube.com");
	});

	test("shows error for invalid YouTube URL on blur", async () => {
		render(<AddVideoModal {...defaultProps} />);

		const input = screen.getByTestId("youtube-url-input");
		fireEvent.change(input, { target: { value: "https://invalid.com/video" } });
		fireEvent.blur(input);

		await waitFor(() => {
			expect(screen.getByTestId("error-message")).toBeDefined();
		});
		expect(screen.getByTestId("error-message").textContent).toContain(
			"valid YouTube URL",
		);
	});

	test("validates standard YouTube URL format", async () => {
		render(<AddVideoModal {...defaultProps} />);

		const input = screen.getByTestId("youtube-url-input");
		fireEvent.change(input, {
			target: { value: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
		});
		fireEvent.blur(input);

		await waitFor(() => {
			expect(screen.queryByTestId("error-message")).toBeNull();
		});
	});

	test("validates youtu.be short URL format", async () => {
		render(<AddVideoModal {...defaultProps} />);

		const input = screen.getByTestId("youtube-url-input");
		fireEvent.change(input, {
			target: { value: "https://youtu.be/dQw4w9WgXcQ" },
		});
		fireEvent.blur(input);

		await waitFor(() => {
			expect(screen.queryByTestId("error-message")).toBeNull();
		});
	});

	test("validates YouTube Shorts URL format", async () => {
		render(<AddVideoModal {...defaultProps} />);

		const input = screen.getByTestId("youtube-url-input");
		fireEvent.change(input, {
			target: { value: "https://www.youtube.com/shorts/dQw4w9WgXcQ" },
		});
		fireEvent.blur(input);

		await waitFor(() => {
			expect(screen.queryByTestId("error-message")).toBeNull();
		});
	});

	test("calls onClose when cancel button is clicked", () => {
		render(<AddVideoModal {...defaultProps} />);

		const cancelButton = screen.getByText("Cancel");
		fireEvent.click(cancelButton);

		expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
	});

	test("calls onClose when close button (X) is clicked", () => {
		render(<AddVideoModal {...defaultProps} />);

		const closeButton = screen.getByLabelText("Close modal");
		fireEvent.click(closeButton);

		expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
	});

	test("calls onClose when backdrop is clicked", () => {
		render(<AddVideoModal {...defaultProps} />);

		const backdrop = screen.getByTestId("add-video-modal-backdrop");
		fireEvent.click(backdrop);

		expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
	});

	test("does not close when modal content is clicked", () => {
		render(<AddVideoModal {...defaultProps} />);

		const modal = screen.getByTestId("add-video-modal");
		fireEvent.click(modal);

		expect(defaultProps.onClose).not.toHaveBeenCalled();
	});

	test("submit button is disabled when URL is empty", () => {
		render(<AddVideoModal {...defaultProps} />);

		const submitButton = screen.getByTestId("submit-button");
		expect(submitButton.getAttribute("disabled")).toBe("");
	});

	test("submit button is enabled when URL is entered", () => {
		render(<AddVideoModal {...defaultProps} />);

		const input = screen.getByTestId("youtube-url-input");
		fireEvent.change(input, {
			target: { value: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
		});

		const submitButton = screen.getByTestId("submit-button");
		expect(submitButton.getAttribute("disabled")).toBeNull();
	});

	test("submits valid URL to API", async () => {
		const mockResponse = {
			id: 1,
			youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
			youtubeId: "dQw4w9WgXcQ",
			status: "pending",
			createdAt: "2026-02-03T12:00:00.000Z",
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 201,
			json: () => Promise.resolve(mockResponse),
		});

		render(<AddVideoModal {...defaultProps} />);

		const input = screen.getByTestId("youtube-url-input");
		fireEvent.change(input, {
			target: { value: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
		});

		const submitButton = screen.getByTestId("submit-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("/api/videos"),
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({
						url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
					}),
				}),
			);
		});

		await waitFor(() => {
			expect(defaultProps.onSuccess).toHaveBeenCalledWith(mockResponse);
			expect(defaultProps.onClose).toHaveBeenCalled();
		});
	});

	test("shows error for 401 unauthorized response", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 401,
		});

		render(<AddVideoModal {...defaultProps} />);

		const input = screen.getByTestId("youtube-url-input");
		fireEvent.change(input, {
			target: { value: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
		});

		const submitButton = screen.getByTestId("submit-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Please sign in to add videos")).toBeDefined();
		});
	});

	test("shows error for 409 duplicate video response", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 409,
			json: () => Promise.resolve({ existingVideoId: 5 }),
		});

		render(<AddVideoModal {...defaultProps} />);

		const input = screen.getByTestId("youtube-url-input");
		fireEvent.change(input, {
			target: { value: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
		});

		const submitButton = screen.getByTestId("submit-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText(/already in your library/)).toBeDefined();
		});
	});

	test("shows error for 400 invalid URL response", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ error: "Invalid YouTube URL" }),
		});

		render(<AddVideoModal {...defaultProps} />);

		const input = screen.getByTestId("youtube-url-input");
		fireEvent.change(input, {
			target: { value: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
		});

		const submitButton = screen.getByTestId("submit-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Invalid YouTube URL")).toBeDefined();
		});
	});

	test("shows loading state during submission", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
			() =>
				new Promise((resolve) =>
					setTimeout(
						() =>
							resolve({
								ok: true,
								status: 201,
								json: () => Promise.resolve({}),
							}),
						100,
					),
				),
		);

		render(<AddVideoModal {...defaultProps} />);

		const input = screen.getByTestId("youtube-url-input");
		fireEvent.change(input, {
			target: { value: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
		});

		const submitButton = screen.getByTestId("submit-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Adding...")).toBeDefined();
		});
	});

	test("shows network error message on fetch failure", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error("Network error"),
		);

		render(<AddVideoModal {...defaultProps} />);

		const input = screen.getByTestId("youtube-url-input");
		fireEvent.change(input, {
			target: { value: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
		});

		const submitButton = screen.getByTestId("submit-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText(/Network error/)).toBeDefined();
		});
	});

	test("clears error when URL is changed after error", async () => {
		render(<AddVideoModal {...defaultProps} />);

		const input = screen.getByTestId("youtube-url-input");
		fireEvent.change(input, { target: { value: "https://invalid.com" } });
		fireEvent.blur(input);

		await waitFor(() => {
			expect(screen.getByTestId("error-message")).toBeDefined();
		});

		fireEvent.change(input, {
			target: { value: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
		});

		// Error should clear immediately when typing
		expect(screen.queryByTestId("error-message")).toBeNull();
	});

	test("displays help text about supported URL formats", () => {
		render(<AddVideoModal {...defaultProps} />);

		expect(screen.getByText(/Supports youtube.com, youtu.be/)).toBeDefined();
	});
});
