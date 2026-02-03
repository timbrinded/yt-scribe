import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TranscriptPanel, TranscriptSkeleton } from "../src/components/TranscriptPanel";

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
	m: {
		div: ({ children, ...props }: React.ComponentProps<"div">) => (
			<div {...props}>{children}</div>
		),
	},
	AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock MotionWrapper
vi.mock("../src/components/MotionWrapper", () => ({
	MotionWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

			expect(screen.getByText("Hello and welcome to this video.")).toBeDefined();
			expect(screen.getByText("Today we're going to talk about testing.")).toBeDefined();
			expect(screen.getByText("Let's get started with the basics.")).toBeDefined();
		});

		it("displays formatted timestamps", () => {
			render(<TranscriptPanel segments={sampleSegments} />);

			expect(screen.getByText("0:00")).toBeDefined();
			expect(screen.getByText("0:05")).toBeDefined();
			expect(screen.getByText("0:12")).toBeDefined();
		});

		it("formats timestamps with hours correctly", () => {
			const longSegments = [
				{ start: 3661, end: 3665, text: "One hour in." },
			];
			render(<TranscriptPanel segments={longSegments} />);

			expect(screen.getByText("1:01:01")).toBeDefined();
		});

		it("shows empty message when no segments", () => {
			render(<TranscriptPanel segments={[]} />);

			expect(screen.getByText("No transcript available")).toBeDefined();
		});

		it("applies custom className", () => {
			const { container } = render(
				<TranscriptPanel segments={sampleSegments} className="custom-class" />
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
				<TranscriptPanel segments={sampleSegments} onTimestampClick={handleClick} />
			);

			const firstTimestamp = screen.getByLabelText("Jump to 0:00");
			fireEvent.click(firstTimestamp);

			expect(handleClick).toHaveBeenCalledWith(0);
		});

		it("calls onTimestampClick with correct time for different segments", () => {
			const handleClick = vi.fn();
			render(
				<TranscriptPanel segments={sampleSegments} onTimestampClick={handleClick} />
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
