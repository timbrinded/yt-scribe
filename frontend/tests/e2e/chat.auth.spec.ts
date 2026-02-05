import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";

interface TestVideo {
	id: number;
	youtubeId: string;
	title: string;
	status: string;
}

interface TestVideoResult {
	video: TestVideo;
	user: {
		id: number;
		email: string;
	};
}

/**
 * E2E tests for the chat flow.
 *
 * These tests run with authentication (*.auth.spec.ts pattern)
 * and test the complete flow of chatting with a video.
 *
 * Note: Tests that send actual chat messages require OPENAI_API_KEY to be set.
 * Without it, those tests will timeout waiting for API responses.
 */
test.describe("Chat Flow", () => {
	let testVideo: TestVideo;

	test.beforeAll(async () => {
		// Create a test video with transcript for chat tests
		const output = execSync("bun e2e/helpers/create-test-video.ts", {
			encoding: "utf-8",
			cwd: "..",
		});
		const result: TestVideoResult = JSON.parse(output.trim());
		testVideo = result.video;
	});

	test.beforeEach(async ({ page }) => {
		// Navigate to the video detail page
		await page.goto(`/video/${testVideo.id}`);

		// Wait for the page to load (video header with title should be visible)
		// Use a more specific selector to avoid matching other elements
		await expect(
			page.locator("h1").filter({ hasText: testVideo.title }),
		).toBeVisible({
			timeout: 10000,
		});
	});

	test("displays video detail page with transcript and chat panels", async ({
		page,
	}) => {
		// Verify two-column layout - use exact match for headings
		await expect(
			page.getByRole("heading", { name: "Transcript", exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Chat", exact: true }),
		).toBeVisible();

		// Verify transcript panel has segments
		await expect(page.getByText(/segments/)).toBeVisible();

		// Verify chat empty state
		await expect(page.getByText(/Ask about this video/)).toBeVisible();
	});

	test("displays transcript segments with timestamps", async ({ page }) => {
		// Wait for transcript segments to load
		const transcriptPanel = page.locator('[data-testid="transcript-panel"]');
		await expect(transcriptPanel).toBeVisible();

		// Verify at least one segment is visible
		const segments = page.locator('[data-testid="transcript-segment"]');
		await expect(segments.first()).toBeVisible();

		// Verify timestamps are displayed (format: M:SS or MM:SS)
		const firstSegment = segments.first();
		await expect(firstSegment.locator("button")).toContainText(/\d:\d\d/);
	});

	test("shows chat input field and send button", async ({ page }) => {
		// Find the chat input field
		const chatInput = page.getByPlaceholder(/Ask about this video/);
		await expect(chatInput).toBeVisible();

		// Find the send button (it's in the chat panel, not the mobile menu)
		// The chat panel has a ComposerPrimitive.Send button
		const chatPanel = page.locator('[class*="flex-col bg-white"]').filter({
			has: page.getByPlaceholder(/Ask about this video/),
		});
		const sendButton = chatPanel.locator("button").last();
		await expect(sendButton).toBeVisible();
	});

	test("can type a message in the chat input", async ({ page }) => {
		const chatInput = page.getByPlaceholder(/Ask about this video/);
		await expect(chatInput).toBeVisible();

		// Type a message
		await chatInput.fill("What is this video about?");
		await expect(chatInput).toHaveValue("What is this video about?");
	});

	test("sends message and receives assistant response", async ({ page }) => {
		// Skip this test if OPENAI_API_KEY is not set (requires real API call)
		test.skip(!process.env.OPENAI_API_KEY, "Requires OPENAI_API_KEY to be set");

		// Find and fill the chat input
		const chatInput = page.getByPlaceholder(/Ask about this video/);
		await chatInput.fill("What is the main topic of this video?");

		// Submit the message by pressing Enter
		await chatInput.press("Enter");

		// Wait for the user message to appear
		// User messages have specific styling (bg-primary)
		const userMessage = page.locator('[class*="bg-primary-600"]').filter({
			hasText: "What is the main topic of this video?",
		});
		await expect(userMessage).toBeVisible({ timeout: 5000 });

		// Wait for the assistant response to appear
		// Assistant messages have a neutral background and an avatar
		// Look for the message container with assistant styling
		const assistantMessages = page.locator(
			'[class*="rounded-2xl"][class*="rounded-tl-md"][class*="bg-neutral-100"]',
		);

		// Use a longer timeout for API response
		await expect(assistantMessages.first()).toBeVisible({ timeout: 60000 });
	});

	test("clicking timestamp in transcript activates segment", async ({
		page,
	}) => {
		// Get the transcript panel
		const transcriptPanel = page.locator('[data-testid="transcript-panel"]');
		await expect(transcriptPanel).toBeVisible();

		// Find segments - wait for them to load
		const segments = page.locator('[data-testid="transcript-segment"]');
		await expect(segments.first()).toBeVisible();

		const count = await segments.count();
		expect(count).toBeGreaterThan(0);

		// Initially, no segment should be active
		const firstSegment = segments.first();
		await expect(firstSegment).toHaveAttribute("data-active", "false");

		// Click on the timestamp button inside the first segment
		// Use dispatchEvent to ensure React's event handler is triggered
		const timestampButton = firstSegment.locator("button");
		await timestampButton.dispatchEvent("click");

		// Wait for the segment to become active
		// The click triggers: onClick -> handleTimestampClick -> setActiveIndex -> onActiveSegmentChange -> context update
		await expect(firstSegment).toHaveAttribute("data-active", "true", {
			timeout: 5000,
		});

		// If there are multiple segments, clicking another should change the active one
		if (count > 1) {
			const secondSegment = segments.nth(1);
			const secondButton = secondSegment.locator("button");
			await secondButton.dispatchEvent("click");

			// Now second segment should be active
			await expect(secondSegment).toHaveAttribute("data-active", "true", {
				timeout: 5000,
			});
			// And first segment should no longer be active
			await expect(firstSegment).toHaveAttribute("data-active", "false");
		}
	});

	test("maintains chat session across messages", async ({ page }) => {
		// Skip this test if OPENAI_API_KEY is not set (requires real API calls)
		test.skip(!process.env.OPENAI_API_KEY, "Requires OPENAI_API_KEY to be set");

		const chatInput = page.getByPlaceholder(/Ask about this video/);

		// Send first message
		await chatInput.fill("What topics are covered in this video?");
		await chatInput.press("Enter");

		// Wait for first user message to appear
		const firstUserMessage = page.locator('[class*="bg-primary-600"]').filter({
			hasText: "What topics are covered",
		});
		await expect(firstUserMessage).toBeVisible({ timeout: 5000 });

		// Wait for assistant response (longer timeout for API)
		const assistantMessages = page.locator(
			'[class*="rounded-2xl"][class*="rounded-tl-md"][class*="bg-neutral-100"]',
		);
		await expect(assistantMessages.first()).toBeVisible({ timeout: 60000 });

		// Send follow-up message
		await chatInput.fill("Tell me more about the React section");
		await chatInput.press("Enter");

		// Wait for second user message
		const secondUserMessage = page.locator('[class*="bg-primary-600"]').filter({
			hasText: "Tell me more about the React",
		});
		await expect(secondUserMessage).toBeVisible({ timeout: 5000 });

		// Verify we now have multiple user messages
		const userMessages = page.locator('[class*="bg-primary-600"]').filter({
			has: page.locator("p"),
		});
		await expect(userMessages).toHaveCount(2, { timeout: 60000 });
	});

	test("navigating back to library preserves video state", async ({ page }) => {
		// Click the "Back to library" link
		const backLink = page.getByRole("link", { name: /Back to library/ });
		await expect(backLink).toBeVisible();
		await backLink.click();

		// Should be on library page
		await expect(
			page.getByRole("heading", { name: "Your Library" }),
		).toBeVisible();

		// Navigate back to video
		await page.goto(`/video/${testVideo.id}`);

		// Video detail page should load correctly - use specific selectors
		await expect(
			page.locator("h1").filter({ hasText: testVideo.title }),
		).toBeVisible({
			timeout: 10000,
		});
		await expect(
			page.getByRole("heading", { name: "Transcript", exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Chat", exact: true }),
		).toBeVisible();
	});
});
