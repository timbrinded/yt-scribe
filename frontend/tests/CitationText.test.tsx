import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CitationText } from "../src/components/CitationText";
import {
	TimestampNavigationProvider,
	useTimestampNavigation,
} from "../src/contexts/TimestampNavigationContext";

// Mock framer-motion
vi.mock("framer-motion", () => ({
	m: {
		div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
			<div {...props}>{children}</div>
		),
	},
	AnimatePresence: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	domAnimation: {},
	LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("CitationText", () => {
	it("renders plain text without citations", () => {
		render(<CitationText text="No timestamps here" />);
		expect(screen.getByTestId("citation-text")).toHaveTextContent(
			"No timestamps here",
		);
	});

	it("renders text with single citation as clickable link", () => {
		render(<CitationText text="See [0:30] for details" />);
		expect(screen.getByTestId("citation-text")).toBeInTheDocument();
		expect(screen.getByTestId("citation-link")).toBeInTheDocument();
		expect(screen.getByTestId("citation-link")).toHaveTextContent("0:30");
	});

	it("renders multiple citations", () => {
		render(
			<CitationText text="Start at [0:30], then [2:15], finally [1:00:00]" />,
		);
		const links = screen.getAllByTestId("citation-link");
		expect(links).toHaveLength(3);
		expect(links[0]).toHaveTextContent("0:30");
		expect(links[1]).toHaveTextContent("2:15");
		expect(links[2]).toHaveTextContent("1:00:00");
	});

	it("renders citation with correct timestamp data attribute", () => {
		render(<CitationText text="[2:30]" />);
		const link = screen.getByTestId("citation-link");
		expect(link).toHaveAttribute("data-timestamp", "150");
	});

	it("calls onCitationClick when citation is clicked", () => {
		const onCitationClick = vi.fn();
		render(
			<CitationText
				text="Click [1:00] here"
				onCitationClick={onCitationClick}
			/>,
		);
		fireEvent.click(screen.getByTestId("citation-link"));
		expect(onCitationClick).toHaveBeenCalledWith(60);
	});

	it("applies custom className", () => {
		render(<CitationText text="Test" className="custom-class" />);
		expect(screen.getByTestId("citation-text")).toHaveClass("custom-class");
	});

	it("renders citation with title attribute for accessibility", () => {
		render(<CitationText text="[5:30]" />);
		const link = screen.getByTestId("citation-link");
		expect(link).toHaveAttribute("title", "Jump to 5:30");
	});

	it("preserves text around citations", () => {
		render(<CitationText text="Before [0:30] middle [1:00] after" />);
		const container = screen.getByTestId("citation-text");
		expect(container.textContent).toContain("Before");
		expect(container.textContent).toContain("middle");
		expect(container.textContent).toContain("after");
	});
});

describe("CitationText with TimestampNavigationContext", () => {
	// Component to capture context state
	function NavigationStateCapture({
		onStateChange,
	}: {
		onStateChange: (index: number | null) => void;
	}) {
		const { activeSegmentIndex } = useTimestampNavigation();
		// Call immediately on render to capture state
		onStateChange(activeSegmentIndex);
		return null;
	}

	it("navigates to timestamp when citation is clicked", () => {
		const stateChanges: (number | null)[] = [];
		const captureState = (index: number | null) => {
			stateChanges.push(index);
		};

		const testSegments = [
			{ start: 0, end: 30, text: "First" },
			{ start: 30, end: 60, text: "Second" },
			{ start: 60, end: 90, text: "Third" },
		];

		function TestComponent() {
			const { setSegments } = useTimestampNavigation();
			// Set segments on mount
			setSegments(testSegments);
			return (
				<>
					<CitationText text="Go to [0:45]" />
					<NavigationStateCapture onStateChange={captureState} />
				</>
			);
		}

		render(
			<TimestampNavigationProvider>
				<TestComponent />
			</TimestampNavigationProvider>,
		);

		// Initial state should be null
		expect(stateChanges[stateChanges.length - 1]).toBe(null);

		// Click the citation
		fireEvent.click(screen.getByTestId("citation-link"));

		// Should navigate to segment containing timestamp 45 (second segment: 30-60)
		expect(stateChanges[stateChanges.length - 1]).toBe(1);
	});

	it("works without context (returns early gracefully)", () => {
		// Should not throw when used outside provider
		render(<CitationText text="Test [0:30]" />);
		const link = screen.getByTestId("citation-link");

		// Should not throw when clicking
		expect(() => fireEvent.click(link)).not.toThrow();
	});
});
