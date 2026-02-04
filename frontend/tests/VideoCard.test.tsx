import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VideoCard, type VideoStatus } from "../src/components/VideoCard";

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
	m: {
		article: ({
			children,
			className,
			onClick,
			"data-testid": testId,
			"data-video-id": videoId,
			"data-status": status,
		}: {
			children: React.ReactNode;
			className?: string;
			onClick?: () => void;
			"data-testid"?: string;
			"data-video-id"?: number;
			"data-status"?: string;
		}) => (
			<article
				className={className}
				onClick={onClick}
				data-testid={testId}
				data-video-id={videoId}
				data-status={status}
			>
				{children}
			</article>
		),
		div: ({
			children,
			className,
		}: {
			children: React.ReactNode;
			className?: string;
		}) => <div className={className}>{children}</div>,
		img: ({
			src,
			alt,
			className,
		}: {
			src: string;
			alt: string;
			className?: string;
		}) => <img src={src} alt={alt} className={className} />,
		span: ({
			children,
			className,
		}: {
			children: React.ReactNode;
			className?: string;
		}) => <span className={className}>{children}</span>,
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

describe("VideoCard", () => {
	const defaultProps = {
		id: 1,
		title: "Test Video Title",
		youtubeId: "dQw4w9WgXcQ",
		thumbnailUrl: "https://example.com/thumbnail.jpg",
		duration: 596,
		status: "completed" as VideoStatus,
	};

	test("renders video card with all props", () => {
		render(<VideoCard {...defaultProps} />);

		expect(screen.getByTestId("video-card")).toBeDefined();
		expect(screen.getByText("Test Video Title")).toBeDefined();
		expect(screen.getByRole("img")).toHaveProperty(
			"src",
			defaultProps.thumbnailUrl,
		);
	});

	test("displays correct title", () => {
		render(<VideoCard {...defaultProps} />);
		expect(screen.getByText("Test Video Title")).toBeDefined();
	});

	test("shows 'Untitled Video' when title is null", () => {
		render(<VideoCard {...defaultProps} title={null} />);
		expect(screen.getByText("Untitled Video")).toBeDefined();
	});

	test("formats duration as MM:SS for short videos", () => {
		render(<VideoCard {...defaultProps} duration={125} />);
		expect(screen.getByText("2:05")).toBeDefined();
	});

	test("formats duration as HH:MM:SS for long videos", () => {
		render(<VideoCard {...defaultProps} duration={3725} />);
		expect(screen.getByText("1:02:05")).toBeDefined();
	});

	test("does not display duration when null", () => {
		render(<VideoCard {...defaultProps} duration={null} />);
		expect(screen.queryByText(/^\d+:\d+/)).toBeNull();
	});

	test("displays 'Ready' status badge for completed videos", () => {
		render(<VideoCard {...defaultProps} status="completed" />);
		expect(screen.getByText("Ready")).toBeDefined();
	});

	test("displays 'Pending' status badge for pending videos", () => {
		render(<VideoCard {...defaultProps} status="pending" />);
		expect(screen.getByText("Pending")).toBeDefined();
	});

	test("displays 'Processing' status badge for processing videos", () => {
		render(<VideoCard {...defaultProps} status="processing" />);
		expect(screen.getByText("Processing")).toBeDefined();
	});

	test("displays 'Failed' status badge for failed videos", () => {
		render(<VideoCard {...defaultProps} status="failed" />);
		expect(screen.getByText("Failed")).toBeDefined();
	});

	test("generates YouTube thumbnail URL when thumbnailUrl is null", () => {
		render(<VideoCard {...defaultProps} thumbnailUrl={null} />);
		const img = screen.getByRole("img");
		expect(img.getAttribute("src")).toBe(
			`https://img.youtube.com/vi/${defaultProps.youtubeId}/hqdefault.jpg`,
		);
	});

	test("calls onClick handler when completed video is clicked", () => {
		const onClick = vi.fn();
		render(
			<VideoCard {...defaultProps} status="completed" onClick={onClick} />,
		);

		fireEvent.click(screen.getByTestId("video-card"));
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	test("does not call onClick handler when pending video is clicked", () => {
		const onClick = vi.fn();
		render(<VideoCard {...defaultProps} status="pending" onClick={onClick} />);

		fireEvent.click(screen.getByTestId("video-card"));
		expect(onClick).not.toHaveBeenCalled();
	});

	test("does not call onClick handler when processing video is clicked", () => {
		const onClick = vi.fn();
		render(
			<VideoCard {...defaultProps} status="processing" onClick={onClick} />,
		);

		fireEvent.click(screen.getByTestId("video-card"));
		expect(onClick).not.toHaveBeenCalled();
	});

	test("does not call onClick handler when failed video is clicked", () => {
		const onClick = vi.fn();
		render(<VideoCard {...defaultProps} status="failed" onClick={onClick} />);

		fireEvent.click(screen.getByTestId("video-card"));
		expect(onClick).not.toHaveBeenCalled();
	});

	test("has cursor-pointer class for completed videos", () => {
		render(<VideoCard {...defaultProps} status="completed" />);
		const card = screen.getByTestId("video-card");
		expect(card.className).toContain("cursor-pointer");
	});

	test("has cursor-default class for non-completed videos", () => {
		render(<VideoCard {...defaultProps} status="pending" />);
		const card = screen.getByTestId("video-card");
		expect(card.className).toContain("cursor-default");
	});

	test("includes video ID as data attribute", () => {
		render(<VideoCard {...defaultProps} />);
		const card = screen.getByTestId("video-card");
		expect(card.getAttribute("data-video-id")).toBe(String(defaultProps.id));
	});

	test("includes status as data attribute", () => {
		render(<VideoCard {...defaultProps} status="processing" />);
		const card = screen.getByTestId("video-card");
		expect(card.getAttribute("data-status")).toBe("processing");
	});

	test("renders with delay prop", () => {
		// Just verify it doesn't crash with delay prop
		render(<VideoCard {...defaultProps} delay={0.5} />);
		expect(screen.getByTestId("video-card")).toBeDefined();
	});
});
