import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
	TranscriptPanel,
	TranscriptSkeleton,
	findSegmentIndexForTimestamp,
} from "../src/components/TranscriptPanel";

// Mock framer-motion to avoid animation issues in tests
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

const sampleSegments = [
	{ start: 0, end: 5, text: "Hello and welcome to this video." },
	{ start: 5, end: 12, text: "Today we're going to talk about testing." },
	{ start: 12, end: 20, text: "Let's get started with the basics." },
];

describe("TranscriptPanel", () => {
	describe("rendering", () => {
		it("renders all segments", () => {
			render(<TranscriptPanel segments={sampleSegments} />);

			expect(
				screen.getByText("Hello and welcome to this video."),
			).toBeDefined();
			expect(
				screen.getByText("Today we're going to talk about testing."),
			).toBeDefined();
			expect(
				screen.getByText("Let's get started with the basics."),
			).toBeDefined();
		});

		it("displays formatted timestamps", () => {
			render(<TranscriptPanel segments={sampleSegments} />);

			expect(screen.getByText("0:00")).toBeDefined();
			expect(screen.getByText("0:05")).toBeDefined();
			expect(screen.getByText("0:12")).toBeDefined();
		});

		it("formats timestamps with hours correctly", () => {
			const longSegments = [{ start: 3661, end: 3665, text: "One hour in." }];
			render(<TranscriptPanel segments={longSegments} />);

			expect(screen.getByText("1:01:01")).toBeDefined();
		});

		it("shows empty message when no segments", () => {
			render(<TranscriptPanel segments={[]} />);

			expect(screen.getByText("No transcript available")).toBeDefined();
		});

		it("applies custom className", () => {
			const { container } = render(
				<TranscriptPanel segments={sampleSegments} className="custom-class" />,
			);

			const wrapper = container.firstElementChild;
			expect(wrapper?.className).toContain("custom-class");
		});

		it("has proper accessibility attributes", () => {
			render(<TranscriptPanel segments={sampleSegments} />);

			const list = screen.getByRole("list");
			expect(list.getAttribute("aria-label")).toBe("Video transcript");
		});
	});

	describe("timestamp clicks", () => {
		it("calls onTimestampClick when timestamp button is clicked", () => {
			const handleClick = vi.fn();
			render(
				<TranscriptPanel
					segments={sampleSegments}
					onTimestampClick={handleClick}
				/>,
			);

			const firstTimestamp = screen.getByLabelText("Jump to 0:00");
			fireEvent.click(firstTimestamp);

			expect(handleClick).toHaveBeenCalledWith(0);
		});

		it("calls onTimestampClick with correct time for different segments", () => {
			const handleClick = vi.fn();
			render(
				<TranscriptPanel
					segments={sampleSegments}
					onTimestampClick={handleClick}
				/>,
			);

			const secondTimestamp = screen.getByLabelText("Jump to 0:05");
			fireEvent.click(secondTimestamp);

			expect(handleClick).toHaveBeenCalledWith(5);
		});
	});

	describe("segment data attributes", () => {
		it("includes start time in data attribute", () => {
			render(<TranscriptPanel segments={sampleSegments} />);

			const segments = screen.getAllByTestId("transcript-segment");
			expect(segments[0].getAttribute("data-start")).toBe("0");
			expect(segments[1].getAttribute("data-start")).toBe("5");
			expect(segments[2].getAttribute("data-start")).toBe("12");
		});
	});
});

describe("TranscriptSkeleton", () => {
	it("renders skeleton placeholders", () => {
		const { container } = render(<TranscriptSkeleton />);

		// Should have multiple skeleton items
		const skeletons = container.querySelectorAll(".animate-pulse");
		expect(skeletons.length).toBeGreaterThan(0);
	});

	it("shows multiple rows", () => {
		const { container } = render(<TranscriptSkeleton />);

		// Should have at least 8 skeleton rows
		const rows = container.querySelectorAll(".flex.gap-3");
		expect(rows.length).toBeGreaterThanOrEqual(8);
	});
});

describe("controlled active segment", () => {
	it("highlights segment when activeSegmentIndex is provided", () => {
		render(
			<TranscriptPanel segments={sampleSegments} activeSegmentIndex={1} />,
		);

		const segments = screen.getAllByTestId("transcript-segment");
		expect(segments[0].getAttribute("data-active")).toBe("false");
		expect(segments[1].getAttribute("data-active")).toBe("true");
		expect(segments[2].getAttribute("data-active")).toBe("false");
	});

	it("calls onActiveSegmentChange when segment is clicked", () => {
		const handleChange = vi.fn();
		render(
			<TranscriptPanel
				segments={sampleSegments}
				activeSegmentIndex={null}
				onActiveSegmentChange={handleChange}
			/>,
		);

		const firstTimestamp = screen.getByLabelText("Jump to 0:00");
		fireEvent.click(firstTimestamp);

		expect(handleChange).toHaveBeenCalledWith(0);
	});

	it("allows null activeSegmentIndex for no highlight", () => {
		render(
			<TranscriptPanel segments={sampleSegments} activeSegmentIndex={null} />,
		);

		const segments = screen.getAllByTestId("transcript-segment");
		segments.forEach((segment) => {
			expect(segment.getAttribute("data-active")).toBe("false");
		});
	});

	it("uses internal state when activeSegmentIndex is not provided", () => {
		render(<TranscriptPanel segments={sampleSegments} />);

		// Initially no segment is active
		const segments = screen.getAllByTestId("transcript-segment");
		segments.forEach((segment) => {
			expect(segment.getAttribute("data-active")).toBe("false");
		});

		// Click to activate
		const firstTimestamp = screen.getByLabelText("Jump to 0:00");
		fireEvent.click(firstTimestamp);

		// Now first segment should be active (internal state)
		expect(segments[0].getAttribute("data-active")).toBe("true");
	});
});

describe("findSegmentIndexForTimestamp", () => {
	it("returns null for empty segments array", () => {
		expect(findSegmentIndexForTimestamp([], 5)).toBeNull();
	});

	it("finds segment containing the timestamp", () => {
		// Timestamp 7 is within segment 1 (5-12)
		expect(findSegmentIndexForTimestamp(sampleSegments, 7)).toBe(1);
	});

	it("finds first segment for timestamp at start boundary", () => {
		expect(findSegmentIndexForTimestamp(sampleSegments, 0)).toBe(0);
	});

	it("finds segment for timestamp at segment start", () => {
		expect(findSegmentIndexForTimestamp(sampleSegments, 5)).toBe(1);
	});

	it("returns closest preceding segment for timestamp between segments", () => {
		// If there's a gap between segments, find the one before
		const gappySegments = [
			{ start: 0, end: 5, text: "First" },
			{ start: 10, end: 15, text: "Second" },
		];
		// Timestamp 7 is after segment 0 ends but before segment 1 starts
		expect(findSegmentIndexForTimestamp(gappySegments, 7)).toBe(0);
	});

	it("returns last segment for timestamp after all segments", () => {
		expect(findSegmentIndexForTimestamp(sampleSegments, 100)).toBe(2);
	});

	it("returns first segment for timestamp before all segments", () => {
		const laterSegments = [{ start: 10, end: 15, text: "Starts at 10" }];
		expect(findSegmentIndexForTimestamp(laterSegments, 5)).toBe(0);
	});
});
