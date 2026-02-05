import { test, expect } from "@playwright/test";
import { createClerkClient } from "@clerk/backend";

/**
 * E2E tests for the video add flow.
 *
 * These tests run with authentication (*.auth.spec.ts pattern)
 * and test the complete flow of adding a video to the library.
 *
 * Note: Each test signs in fresh because Clerk's storageState doesn't
 * properly restore the client-side session needed for API token retrieval.
 */
test.describe("Add Video Flow", () => {
	test.beforeEach(async ({ page }) => {
		const username = process.env.E2E_CLERK_USER_USERNAME;
		const secretKey = process.env.CLERK_SECRET_KEY;

		if (!username || !secretKey) {
			throw new Error(
				"E2E_CLERK_USER_USERNAME and CLERK_SECRET_KEY must be set",
			);
		}

		// Create a fresh sign-in token for this test
		const clerk = createClerkClient({ secretKey });
		const users = await clerk.users.getUserList({ emailAddress: [username] });
		if (users.data.length === 0) {
			throw new Error(`Test user ${username} not found`);
		}
		const signInToken = await clerk.signInTokens.createSignInToken({
			userId: users.data[0].id,
			expiresInSeconds: 300,
		});

		// Navigate to app and wait for Clerk to load
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Sign in using the token via Clerk's client-side method
		// and verify session is established
		const sessionEstablished = await page.evaluate(
			async ({ token }) => {
				const waitForClerk = () =>
					new Promise<any>((resolve) => {
						const check = () => {
							if ((window as any).Clerk?.client) {
								resolve((window as any).Clerk);
							} else {
								setTimeout(check, 100);
							}
						};
						check();
					});

				const clerk = await waitForClerk();
				const signIn = await clerk.client.signIn.create({
					strategy: "ticket",
					ticket: token,
				});
				await clerk.setActive({ session: signIn.createdSessionId });

				// Wait for session to be fully established
				const maxWait = 5000;
				const interval = 100;
				let waited = 0;
				while (waited < maxWait) {
					if (clerk.session?.getToken) {
						try {
							const testToken = await clerk.session.getToken();
							if (testToken) {
								return true;
							}
						} catch {
							// Token not ready yet
						}
					}
					await new Promise((resolve) => setTimeout(resolve, interval));
					waited += interval;
				}
				return false;
			},
			{ token: signInToken.token },
		);

		if (!sessionEstablished) {
			throw new Error("Failed to establish Clerk session");
		}

		// Navigate to library page
		await page.goto("/library");
		await page.waitForLoadState("networkidle");

		// Wait for the page to load (library header should be visible)
		await expect(
			page.getByRole("heading", { name: "Your Library" }),
		).toBeVisible({ timeout: 15000 });
	});

	test("opens add video modal when clicking Add Video button", async ({
		page,
	}) => {
		// Click the Add Video button
		const addButton = page.getByRole("button", { name: /Add Video/i });
		await expect(addButton).toBeVisible();
		await addButton.click();

		// Modal should appear
		const modal = page.getByTestId("add-video-modal");
		await expect(modal).toBeVisible();

		// Modal should have the expected elements
		await expect(
			modal.getByRole("heading", { name: "Add Video" }),
		).toBeVisible();
		await expect(modal.getByTestId("youtube-url-input")).toBeVisible();
		await expect(modal.getByTestId("submit-button")).toBeVisible();
	});

	test("shows validation error for invalid YouTube URL", async ({ page }) => {
		// Open the modal
		await page.getByRole("button", { name: /Add Video/i }).click();

		const modal = page.getByTestId("add-video-modal");
		await expect(modal).toBeVisible();

		// Enter an invalid URL
		const input = modal.getByTestId("youtube-url-input");
		await input.fill("https://invalid-url.com/video");
		await input.blur();

		// Error message should appear
		await expect(modal.getByTestId("error-message")).toBeVisible();
		await expect(modal.getByTestId("error-message")).toContainText(
			"valid YouTube URL",
		);
	});

	test("accepts valid YouTube URL and shows validation indicator", async ({
		page,
	}) => {
		// Open the modal
		await page.getByRole("button", { name: /Add Video/i }).click();

		const modal = page.getByTestId("add-video-modal");
		await expect(modal).toBeVisible();

		// Enter a valid YouTube URL
		const input = modal.getByTestId("youtube-url-input");
		await input.fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
		await input.blur();

		// Should not show error message
		await expect(modal.getByTestId("error-message")).not.toBeVisible();

		// Success checkmark should appear (validation indicator)
		// The input should have success styling
		await expect(input).toHaveClass(/border-success/);
	});

	test("closes modal when clicking Cancel button", async ({ page }) => {
		// Open the modal
		await page.getByRole("button", { name: /Add Video/i }).click();

		const modal = page.getByTestId("add-video-modal");
		await expect(modal).toBeVisible();

		// Click Cancel button
		await modal.getByRole("button", { name: "Cancel" }).click();

		// Modal should close
		await expect(modal).not.toBeVisible();
	});

	test("closes modal when clicking backdrop", async ({ page }) => {
		// Open the modal
		await page.getByRole("button", { name: /Add Video/i }).click();

		const backdrop = page.getByTestId("add-video-modal-backdrop");
		await expect(backdrop).toBeVisible();

		// Click on the backdrop (in bottom left corner, avoiding header)
		// The header is sticky at the top, so we click at the bottom
		const box = await backdrop.boundingBox();
		if (box) {
			await page.mouse.click(box.x + 10, box.y + box.height - 50);
		} else {
			// Fallback if boundingBox fails
			await backdrop.click({ force: true });
		}

		// Modal should close
		await expect(page.getByTestId("add-video-modal")).not.toBeVisible();
	});

	test("closes modal when pressing Escape key", async ({ page }) => {
		// Open the modal
		await page.getByRole("button", { name: /Add Video/i }).click();

		const modal = page.getByTestId("add-video-modal");
		await expect(modal).toBeVisible();

		// Press Escape key
		await page.keyboard.press("Escape");

		// Modal should close
		await expect(modal).not.toBeVisible();
	});

	test("successfully adds video and shows it in library", async ({ page }) => {
		// Note the initial video count
		const initialCount = await page
			.locator("[data-testid='video-card']")
			.count();

		// Open the modal
		await page.getByRole("button", { name: /Add Video/i }).click();

		const modal = page.getByTestId("add-video-modal");
		await expect(modal).toBeVisible();

		// Enter a valid YouTube URL - use a unique-ish video to minimize duplicates
		const input = modal.getByTestId("youtube-url-input");
		const testUrl = "https://www.youtube.com/watch?v=aqz-KE-bpKQ"; // Big Buck Bunny 60fps
		await input.fill(testUrl);

		// Click Add Video button
		const submitButton = modal.getByTestId("submit-button");
		await submitButton.click();

		// Wait for either success (modal closes) or duplicate error
		const modalVisible = modal;
		const errorMessage = modal.getByTestId("error-message");

		// Wait a bit for the response
		await page.waitForTimeout(2000);

		// Check if we got a duplicate error or success
		const errorVisible = await errorMessage.isVisible().catch(() => false);

		if (errorVisible) {
			// This video already exists from a previous test run - that's OK
			// Verify it shows the duplicate error
			await expect(errorMessage).toContainText(/already in your library/i);

			// Close the modal and verify at least one video exists
			await page.keyboard.press("Escape");
			const videoCards = page.locator("[data-testid='video-card']");
			await expect(videoCards.first()).toBeVisible();
		} else {
			// Video was successfully added
			await expect(modalVisible).not.toBeVisible({ timeout: 10000 });

			// Verify the video appears in the library
			const videoCards = page.locator("[data-testid='video-card']");
			await expect(videoCards).toHaveCount(initialCount + 1);

			// The new video should be visible
			const newVideoCard = videoCards.first();
			await expect(newVideoCard).toBeVisible();
		}
	});

	test("shows error for duplicate video", async ({ page }) => {
		const testUrl = "https://www.youtube.com/watch?v=L_LUpnjgPso"; // Public video

		// First attempt - add the video (might already exist)
		await page.getByRole("button", { name: /Add Video/i }).click();
		let modal = page.getByTestId("add-video-modal");
		await expect(modal).toBeVisible();

		await modal.getByTestId("youtube-url-input").fill(testUrl);
		await modal.getByTestId("submit-button").click();

		// Wait for response
		await page.waitForTimeout(2000);

		// Check if we got success or duplicate
		const errorMessage = modal.getByTestId("error-message");
		const errorVisible = await errorMessage.isVisible().catch(() => false);

		if (!errorVisible) {
			// Video was added - now close and try again to test duplicate
			await expect(modal).not.toBeVisible({ timeout: 10000 });
		} else {
			// Already a duplicate - close the modal first
			await page.keyboard.press("Escape");
			await expect(modal).not.toBeVisible();
		}

		// Now try to add the same video again (should be a duplicate now)
		await page.getByRole("button", { name: /Add Video/i }).click();
		modal = page.getByTestId("add-video-modal");
		await expect(modal).toBeVisible();

		await modal.getByTestId("youtube-url-input").fill(testUrl);
		await modal.getByTestId("submit-button").click();

		// Should show duplicate error
		await expect(modal.getByTestId("error-message")).toBeVisible({
			timeout: 10000,
		});
		await expect(modal.getByTestId("error-message")).toContainText(
			/already in your library/i,
		);
	});

	test("video card shows YouTube thumbnail", async ({ page }) => {
		// The video card should display the YouTube thumbnail
		// This assumes there's at least one video in the library from previous tests

		// If no videos exist, add one first
		const existingCards = await page
			.locator("[data-testid='video-card']")
			.count();

		if (existingCards === 0) {
			// Add a video
			await page.getByRole("button", { name: /Add Video/i }).click();
			const modal = page.getByTestId("add-video-modal");
			await modal
				.getByTestId("youtube-url-input")
				.fill("https://www.youtube.com/watch?v=YE7VzlLtp-4");
			await modal.getByTestId("submit-button").click();

			// Wait for response and handle both success and duplicate cases
			await page.waitForTimeout(2000);
			const errorMessage = modal.getByTestId("error-message");
			const errorVisible = await errorMessage.isVisible().catch(() => false);

			if (errorVisible) {
				// Video already exists from previous test run - close modal
				await page.keyboard.press("Escape");
				await expect(modal).not.toBeVisible();
			} else {
				// Video was added successfully
				await expect(modal).not.toBeVisible({ timeout: 10000 });
			}
		}

		// Check that video cards have thumbnail images
		const videoCard = page.locator("[data-testid='video-card']").first();
		await expect(videoCard).toBeVisible();

		// The thumbnail image should be present
		const thumbnail = videoCard.locator("img");
		await expect(thumbnail).toBeVisible();

		// Thumbnail should be a YouTube URL or have src attribute
		const src = await thumbnail.getAttribute("src");
		expect(src).toBeTruthy();
	});
});
