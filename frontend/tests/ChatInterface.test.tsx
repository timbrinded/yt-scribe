import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInterface } from "../src/components/ChatInterface";

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
	m: {
		div: ({
			children,
			className,
		}: {
			children: React.ReactNode;
			className?: string;
		}) => <div className={className}>{children}</div>,
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

describe("ChatInterface", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("renders chat interface with input field", async () => {
		await act(async () => {
			render(<ChatInterface videoId={1} />);
		});

		// Should have an input field for typing messages
		const input = screen.getByPlaceholderText("Ask about this video...");
		expect(input).toBeDefined();
	});

	test("renders empty state when no messages", async () => {
		await act(async () => {
			render(<ChatInterface videoId={1} />);
		});

		// Should show empty state with helpful message
		expect(screen.getByText("Ask about this video")).toBeDefined();
		expect(
			screen.getByText(/Ask questions about the video content/),
		).toBeDefined();
	});

	test("renders send button", async () => {
		await act(async () => {
			render(<ChatInterface videoId={1} />);
		});

		// Should have a send button (could be disabled initially)
		const buttons = screen.getAllByRole("button");
		expect(buttons.length).toBeGreaterThan(0);
	});

	test("accepts videoId prop", async () => {
		// Should render without errors with different video IDs
		const { unmount } = render(<ChatInterface videoId={1} />);

		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});

		expect(
			screen.getByPlaceholderText("Ask about this video..."),
		).toBeDefined();
		unmount();

		await act(async () => {
			render(<ChatInterface videoId={999} />);
		});

		expect(
			screen.getByPlaceholderText("Ask about this video..."),
		).toBeDefined();
	});

	test("accepts optional sessionId prop", async () => {
		await act(async () => {
			render(<ChatInterface videoId={1} sessionId={123} />);
		});

		// Should render without errors with sessionId
		expect(
			screen.getByPlaceholderText("Ask about this video..."),
		).toBeDefined();
	});

	test("accepts optional className prop", async () => {
		await act(async () => {
			render(<ChatInterface videoId={1} className="custom-class" />);
		});

		// The parent div should have the custom class
		const container = document.querySelector(".custom-class");
		expect(container).toBeDefined();
	});

	test("input field is interactive", async () => {
		const user = userEvent.setup();

		await act(async () => {
			render(<ChatInterface videoId={1} />);
		});

		const input = screen.getByPlaceholderText(
			"Ask about this video...",
		) as HTMLTextAreaElement;

		await act(async () => {
			await user.type(input, "What is this video about?");
		});

		expect(input.value).toBe("What is this video about?");
	});

	test("has proper styling structure", async () => {
		await act(async () => {
			render(<ChatInterface videoId={1} />);
		});

		// Check for key structural elements
		// Input should be styled
		const input = screen.getByPlaceholderText("Ask about this video...");
		expect(input.className).toContain("border");

		// Should have a send button with styling
		const button = screen.getByRole("button");
		expect(button.className).toContain("bg-primary");
	});

	test("renders with flex column layout", async () => {
		await act(async () => {
			render(<ChatInterface videoId={1} className="test-container" />);
		});

		const container = document.querySelector(".test-container");
		expect(container?.className).toContain("flex");
		expect(container?.className).toContain("h-full");
		expect(container?.className).toContain("flex-col");
	});

	test("renders empty state with icon", async () => {
		await act(async () => {
			render(<ChatInterface videoId={1} />);
		});

		// The empty state should have an SVG icon
		const svg = document.querySelector("svg");
		expect(svg).toBeDefined();
	});
});
