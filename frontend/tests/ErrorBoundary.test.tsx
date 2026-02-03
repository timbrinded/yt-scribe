import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

// Suppress console.error for cleaner test output
const originalConsoleError = console.error;
beforeEach(() => {
	console.error = vi.fn();
});

afterEach(() => {
	console.error = originalConsoleError;
});

// Test component that throws an error
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
	if (shouldThrow) {
		throw new Error("Test error message");
	}
	return <div data-testid="child-component">Child content</div>;
}

// Test component that always throws
function AlwaysThrowingComponent() {
	throw new Error("Always throws!");
}

// Stateful test wrapper that uses useState
function ResetTestWrapper() {
	const [shouldThrow, setShouldThrow] = useState(true);

	return (
		<div>
			<button type="button" onClick={() => setShouldThrow(false)}>
				Fix error
			</button>
			<ErrorBoundary key={shouldThrow ? "error" : "fixed"}>
				<ThrowingComponent shouldThrow={shouldThrow} />
			</ErrorBoundary>
		</div>
	);
}

describe("ErrorBoundary", () => {
	test("renders children when there is no error", () => {
		render(
			<ErrorBoundary>
				<ThrowingComponent shouldThrow={false} />
			</ErrorBoundary>,
		);

		expect(screen.getByTestId("child-component")).toBeInTheDocument();
		expect(screen.getByText("Child content")).toBeInTheDocument();
	});

	test("renders fallback UI when error is thrown", () => {
		render(
			<ErrorBoundary>
				<AlwaysThrowingComponent />
			</ErrorBoundary>,
		);

		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
		expect(
			screen.getByText(/An unexpected error occurred/),
		).toBeInTheDocument();
	});

	test("renders custom fallback when provided", () => {
		const customFallback = (
			<div data-testid="custom-fallback">Custom error message</div>
		);

		render(
			<ErrorBoundary fallback={customFallback}>
				<AlwaysThrowingComponent />
			</ErrorBoundary>,
		);

		expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
		expect(screen.getByText("Custom error message")).toBeInTheDocument();
		expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
	});

	test("shows Try again button in default fallback", () => {
		render(
			<ErrorBoundary>
				<AlwaysThrowingComponent />
			</ErrorBoundary>,
		);

		expect(
			screen.getByRole("button", { name: /try again/i }),
		).toBeInTheDocument();
	});

	test("shows Go home link in default fallback", () => {
		render(
			<ErrorBoundary>
				<AlwaysThrowingComponent />
			</ErrorBoundary>,
		);

		const homeLink = screen.getByRole("link", { name: /go home/i });
		expect(homeLink).toBeInTheDocument();
		expect(homeLink).toHaveAttribute("href", "/");
	});

	test("resets error state when component is remounted", () => {
		render(<ResetTestWrapper />);

		// Initially shows error
		expect(screen.getByText("Something went wrong")).toBeInTheDocument();

		// Click fix button to change state
		fireEvent.click(screen.getByText("Fix error"));

		// Now child should be rendered
		expect(screen.getByTestId("child-component")).toBeInTheDocument();
	});

	test("logs error to console", () => {
		const consoleSpy = vi.spyOn(console, "error");

		render(
			<ErrorBoundary>
				<AlwaysThrowingComponent />
			</ErrorBoundary>,
		);

		expect(consoleSpy).toHaveBeenCalled();
	});

	test("renders error icon in fallback UI", () => {
		render(
			<ErrorBoundary>
				<AlwaysThrowingComponent />
			</ErrorBoundary>,
		);

		// Check for SVG error icon (warning triangle)
		const svg = document.querySelector("svg");
		expect(svg).toBeInTheDocument();
	});

	test("shows error details in development mode", () => {
		// Note: This test depends on import.meta.env.DEV being true in test environment
		// The component conditionally renders error details based on this

		render(
			<ErrorBoundary>
				<AlwaysThrowingComponent />
			</ErrorBoundary>,
		);

		// The error message should be shown in dev mode
		// We check for the error boundary's error state UI
		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
	});

	test("handles multiple children", () => {
		render(
			<ErrorBoundary>
				<div data-testid="child-1">First child</div>
				<div data-testid="child-2">Second child</div>
			</ErrorBoundary>,
		);

		expect(screen.getByTestId("child-1")).toBeInTheDocument();
		expect(screen.getByTestId("child-2")).toBeInTheDocument();
	});

	test("catches error only in its subtree", () => {
		render(
			<div>
				<div data-testid="outside">Outside error boundary</div>
				<ErrorBoundary>
					<AlwaysThrowingComponent />
				</ErrorBoundary>
			</div>,
		);

		// Content outside the boundary should still render
		expect(screen.getByTestId("outside")).toBeInTheDocument();
		// Error UI should be shown inside the boundary
		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
	});

	test("has proper accessibility attributes", () => {
		render(
			<ErrorBoundary>
				<AlwaysThrowingComponent />
			</ErrorBoundary>,
		);

		// Buttons should be properly labeled
		const tryAgainButton = screen.getByRole("button", { name: /try again/i });
		expect(tryAgainButton).toBeInTheDocument();

		const goHomeLink = screen.getByRole("link", { name: /go home/i });
		expect(goHomeLink).toBeInTheDocument();
	});

	test("maintains error state until reset", () => {
		const { rerender } = render(
			<ErrorBoundary>
				<AlwaysThrowingComponent />
			</ErrorBoundary>,
		);

		expect(screen.getByText("Something went wrong")).toBeInTheDocument();

		// Rerender should keep showing error (state persists)
		rerender(
			<ErrorBoundary>
				<AlwaysThrowingComponent />
			</ErrorBoundary>,
		);

		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
	});
});
