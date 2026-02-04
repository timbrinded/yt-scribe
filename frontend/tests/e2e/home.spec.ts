import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
	test("loads successfully and displays hero section", async ({ page }) => {
		await page.goto("/");

		// Page should be accessible
		await expect(page).toHaveTitle(/YTScribe/);

		// Hero section should be visible
		await expect(
			page.getByRole("heading", { name: /Transform YouTube into Knowledge/i })
		).toBeVisible();

		// Subtitle should be visible
		await expect(
			page.getByText(/YTScribe transcribes your favorite videos/i)
		).toBeVisible();
	});

	test("displays header with logo and navigation", async ({ page }) => {
		await page.goto("/");

		// Header should have logo
		const header = page.getByTestId("header");
		await expect(header).toBeVisible();

		// Logo should be visible (using test id to avoid ambiguity)
		await expect(page.getByTestId("header-logo")).toBeVisible();

		// Navigation links should be present in the desktop nav
		const desktopNav = page.getByRole("navigation", {
			name: "Main navigation",
		});
		await expect(desktopNav.getByRole("link", { name: "Features" })).toBeVisible();
		await expect(desktopNav.getByRole("link", { name: "About" })).toBeVisible();
	});

	test("displays primary and secondary CTA buttons", async ({ page }) => {
		await page.goto("/");

		// Primary CTA
		const primaryCta = page.getByRole("link", { name: /Get Started/i });
		await expect(primaryCta).toBeVisible();
		await expect(primaryCta).toHaveAttribute("href", "/login");

		// Secondary CTA
		const secondaryCta = page.getByRole("link", { name: /Learn More/i });
		await expect(secondaryCta).toBeVisible();
		await expect(secondaryCta).toHaveAttribute("href", "#features");
	});

	test("displays features section", async ({ page }) => {
		await page.goto("/");

		// Scroll to features section (triggers client:visible)
		await page.evaluate(() => {
			document.querySelector("#features")?.scrollIntoView();
		});

		// Wait for features section heading to be visible after scroll
		// Using role heading to be more specific
		await expect(
			page.getByRole("heading", { name: "Transcribe", exact: true })
		).toBeVisible({ timeout: 5000 });
		await expect(
			page.getByRole("heading", { name: "Search", exact: true })
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Chat", exact: true })
		).toBeVisible();
	});

	test("navigates to login when clicking Get Started", async ({ page }) => {
		await page.goto("/");

		// Click the primary CTA
		await page.getByRole("link", { name: /Get Started/i }).click();

		// Should navigate to login page
		await expect(page).toHaveURL("/login");
	});

	test("is responsive on mobile viewport", async ({ page }) => {
		// Set mobile viewport
		await page.setViewportSize({ width: 375, height: 667 });

		await page.goto("/");

		// Hero should still be visible
		await expect(
			page.getByRole("heading", { name: /Transform YouTube into Knowledge/i })
		).toBeVisible();

		// Mobile menu button should be visible
		const menuButton = page.getByTestId("mobile-menu-button");
		await expect(menuButton).toBeVisible();
	});

	test("mobile menu opens and shows navigation links", async ({ page }) => {
		// Set mobile viewport
		await page.setViewportSize({ width: 375, height: 667 });

		await page.goto("/");

		// Click mobile menu button
		await page.getByTestId("mobile-menu-button").click();

		// Wait for mobile menu to appear
		const mobileMenu = page.getByTestId("mobile-menu");
		await expect(mobileMenu).toBeVisible();

		// Navigation links should now be visible in the mobile menu
		const mobileNav = mobileMenu.getByRole("navigation", {
			name: "Mobile navigation",
		});
		await expect(mobileNav.getByRole("link", { name: "Features" })).toBeVisible();
		await expect(mobileNav.getByRole("link", { name: "About" })).toBeVisible();
	});
});
