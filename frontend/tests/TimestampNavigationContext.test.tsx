import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
	TimestampNavigationProvider,
	useTimestampNavigation,
	useTimestampNavigationOptional,
} from "../src/contexts/TimestampNavigationContext";

// Test component that exposes context values
function TestConsumer() {
	const {
		activeSegmentIndex,
		navigateToSegment,
		navigateToTimestamp,
		segments,
		setSegments,
	} = useTimestampNavigation();

	return (
		<div>
			<span data-testid="active-index">{activeSegmentIndex ?? "null"}</span>
			<span data-testid="segments-count">{segments.length}</span>
			<button
				data-testid="navigate-to-segment"
				onClick={() => navigateToSegment(2)}
			>
				Go to segment 2
			</button>
			<button
				data-testid="navigate-to-timestamp"
				onClick={() => navigateToTimestamp(7)}
			>
				Go to timestamp 7
			</button>
			<button
				data-testid="set-segments"
				onClick={() =>
					setSegments([
						{ start: 0, end: 5, text: "First" },
						{ start: 5, end: 10, text: "Second" },
						{ start: 10, end: 15, text: "Third" },
					])
				}
			>
				Set segments
			</button>
			<button
				data-testid="clear-active"
				onClick={() => navigateToSegment(null)}
			>
				Clear active
			</button>
		</div>
	);
}

// Test component for optional hook
function OptionalTestConsumer() {
	const context = useTimestampNavigationOptional();
	return <div data-testid="has-context">{context ? "yes" : "no"}</div>;
}

describe("TimestampNavigationContext", () => {
	describe("TimestampNavigationProvider", () => {
		it("provides default values", () => {
			render(
				<TimestampNavigationProvider>
					<TestConsumer />
				</TimestampNavigationProvider>,
			);

			expect(screen.getByTestId("active-index").textContent).toBe("null");
			expect(screen.getByTestId("segments-count").textContent).toBe("0");
		});

		it("allows setting segments", () => {
			render(
				<TimestampNavigationProvider>
					<TestConsumer />
				</TimestampNavigationProvider>,
			);

			fireEvent.click(screen.getByTestId("set-segments"));

			expect(screen.getByTestId("segments-count").textContent).toBe("3");
		});

		it("navigates to segment index", () => {
			render(
				<TimestampNavigationProvider>
					<TestConsumer />
				</TimestampNavigationProvider>,
			);

			fireEvent.click(screen.getByTestId("navigate-to-segment"));

			expect(screen.getByTestId("active-index").textContent).toBe("2");
		});

		it("clears active segment with null", () => {
			render(
				<TimestampNavigationProvider>
					<TestConsumer />
				</TimestampNavigationProvider>,
			);

			// First set an active segment
			fireEvent.click(screen.getByTestId("navigate-to-segment"));
			expect(screen.getByTestId("active-index").textContent).toBe("2");

			// Then clear it
			fireEvent.click(screen.getByTestId("clear-active"));
			expect(screen.getByTestId("active-index").textContent).toBe("null");
		});

		it("navigates to timestamp when segments are set", () => {
			render(
				<TimestampNavigationProvider>
					<TestConsumer />
				</TimestampNavigationProvider>,
			);

			// First set segments
			fireEvent.click(screen.getByTestId("set-segments"));

			// Then navigate to timestamp 7 (should be in segment 1: 5-10)
			fireEvent.click(screen.getByTestId("navigate-to-timestamp"));

			expect(screen.getByTestId("active-index").textContent).toBe("1");
		});

		it("returns null for timestamp navigation with no segments", () => {
			render(
				<TimestampNavigationProvider>
					<TestConsumer />
				</TimestampNavigationProvider>,
			);

			// Navigate to timestamp without setting segments
			fireEvent.click(screen.getByTestId("navigate-to-timestamp"));

			expect(screen.getByTestId("active-index").textContent).toBe("null");
		});
	});

	describe("useTimestampNavigation", () => {
		it("throws error when used outside provider", () => {
			// Suppress console.error for this test
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			expect(() => render(<TestConsumer />)).toThrow(
				"useTimestampNavigation must be used within a TimestampNavigationProvider",
			);

			consoleSpy.mockRestore();
		});
	});

	describe("useTimestampNavigationOptional", () => {
		it("returns null when used outside provider", () => {
			render(<OptionalTestConsumer />);

			expect(screen.getByTestId("has-context").textContent).toBe("no");
		});

		it("returns context when inside provider", () => {
			render(
				<TimestampNavigationProvider>
					<OptionalTestConsumer />
				</TimestampNavigationProvider>,
			);

			expect(screen.getByTestId("has-context").textContent).toBe("yes");
		});
	});
});
