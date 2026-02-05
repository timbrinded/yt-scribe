import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { VideoDetailView } from "../src/components/VideoDetailView";

// Mock framer-motion
vi.mock("framer-motion", () => ({
	m: {
		div: ({ children, ...props }: React.ComponentProps<"div">) => (
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

// Mock ChatInterface since it has complex dependencies
vi.mock("../src/components/ChatInterface", () => ({
	ChatInterface: ({
		videoId,
		className,
	}: {
		videoId: number;
		className?: string;
	}) => (
		<div
			data-testid="chat-interface"
			data-video-id={videoId}
			className={className}
		>
			Chat Interface Mock
		</div>
	),
}));

// Mock TranscriptPanel
vi.mock("../src/components/TranscriptPanel", () => ({
	TranscriptPanel: ({
		segments,
		className,
	}: {
		segments: unknown[];
		className?: string;
	}) => (
		<div
			data-testid="transcript-panel"
			data-segments={segments.length}
			className={className}
		>
			Transcript Panel Mock
		</div>
	),
	TranscriptSkeleton: () => (
		<div data-testid="transcript-skeleton">Loading...</div>
	),
}));

// Mock ProcessingAnimation
vi.mock("../src/components/ProcessingAnimation", () => ({
	ProcessingAnimation: ({
		currentStage,
		errorMessage,
	}: {
		currentStage: string;
		errorMessage?: string;
	}) => (
		<div data-testid="processing-animation" data-stage={currentStage}>
			{currentStage === "error" ? "Processing Failed" : "Processing Video"}
			{errorMessage && <span>{errorMessage}</span>}
		</div>
	),
}));

// Mock useVideoStatus hook
vi.mock("../src/hooks/useVideoStatus", () => ({
	useVideoStatus: (videoId: number, initialStatus?: string) => ({
		stage:
			initialStatus === "completed"
				? "complete"
				: initialStatus === "failed"
					? "error"
					: "downloading",
		progress: undefined,
		message: undefined,
		error: undefined,
		isConnected: false,
		isComplete: initialStatus === "completed",
		isError: initialStatus === "failed",
	}),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("VideoDetailView", () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	const completedVideo = {
		id: 1,
		youtubeUrl: "https://www.youtube.com/watch?v=abc123",
		youtubeId: "abc123",
		title: "Test Video Title",
		duration: 360,
		thumbnailUrl: "https://img.youtube.com/vi/abc123/mqdefault.jpg",
		status: "completed",
		createdAt: "2026-02-03T10:00:00.000Z",
		updatedAt: "2026-02-03T10:05:00.000Z",
		transcript: {
			id: 1,
			content: "Full transcript content",
			segments: [
				{ start: 0, end: 5, text: "Hello" },
				{ start: 5, end: 10, text: "World" },
			],
			language: "en",
			createdAt: "2026-02-03T10:05:00.000Z",
		},
	};

	const processingVideo = {
		...completedVideo,
		status: "processing",
		transcript: null,
	};

	const pendingVideo = {
		...completedVideo,
		status: "pending",
		transcript: null,
	};

	const failedVideo = {
		...completedVideo,
		status: "failed",
		transcript: null,
	};

	describe("loading state", () => {
		it("shows loading skeleton while fetching", async () => {
			mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

			render(<VideoDetailView videoId={1} />);

			expect(screen.getByTestId("transcript-skeleton")).toBeDefined();
		});
	});

	describe("completed video", () => {
		it("renders video header with title", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(completedVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				expect(screen.getByText("Test Video Title")).toBeDefined();
			});
		});

		it("renders video duration", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(completedVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				expect(screen.getByText("6:00")).toBeDefined();
			});
		});

		it("renders Ready status badge", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(completedVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				expect(screen.getByText("Ready")).toBeDefined();
			});
		});

		it("renders transcript panel", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(completedVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				expect(screen.getByTestId("transcript-panel")).toBeDefined();
			});
		});

		it("renders chat interface", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(completedVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				const chatInterface = screen.getByTestId("chat-interface");
				expect(chatInterface).toBeDefined();
				expect(chatInterface.getAttribute("data-video-id")).toBe("1");
			});
		});

		it("shows Back to library link", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(completedVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				const link = screen.getByText("Back to library");
				expect(link.getAttribute("href")).toBe("/library");
			});
		});

		it("shows Watch on YouTube link", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(completedVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				const link = screen.getByText("Watch on YouTube");
				expect(link.getAttribute("href")).toBe(completedVideo.youtubeUrl);
				expect(link.getAttribute("target")).toBe("_blank");
			});
		});
	});

	describe("processing state", () => {
		it("shows processing animation", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(processingVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				expect(screen.getByTestId("processing-animation")).toBeDefined();
			});
		});

		it("shows Processing status badge", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(processingVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				expect(screen.getByText("Processing")).toBeDefined();
			});
		});
	});

	describe("pending state", () => {
		it("shows processing animation for pending videos", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(pendingVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				expect(screen.getByTestId("processing-animation")).toBeDefined();
			});
		});

		it("shows Pending status badge", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(pendingVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				expect(screen.getByText("Pending")).toBeDefined();
			});
		});
	});

	describe("failed state", () => {
		it("shows processing animation with error state", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(failedVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				expect(screen.getByTestId("processing-animation")).toBeDefined();
			});
		});

		it("shows Failed status badge", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(failedVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				expect(screen.getByText("Failed")).toBeDefined();
			});
		});

		it("shows link to library to retry", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(failedVideo),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				const retryLink = screen.getByText("Go to Library to Retry");
				expect(retryLink.getAttribute("href")).toBe("/library");
			});
		});
	});

	describe("error states", () => {
		it("shows error for 404 response", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				json: () => Promise.resolve({ error: "Video not found" }),
			});

			render(<VideoDetailView videoId={999} />);

			await waitFor(() => {
				expect(screen.getByText("Video not found")).toBeDefined();
			});
		});

		it("shows error for 403 response", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				json: () => Promise.resolve({ error: "Access denied" }),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				expect(
					screen.getByText("You don't have access to this video"),
				).toBeDefined();
			});
		});

		it("shows Try Again button on error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.resolve({ error: "Server error" }),
			});

			render(<VideoDetailView videoId={1} />);

			await waitFor(() => {
				expect(screen.getByText("Try Again")).toBeDefined();
			});
		});
	});

	describe("API calls", () => {
		it("calls API with correct video ID", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(completedVideo),
			});

			render(<VideoDetailView videoId={42} />);

			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledWith(
					expect.stringContaining("/api/videos/42"),
					expect.any(Object),
				);
			});
		});
	});
});
