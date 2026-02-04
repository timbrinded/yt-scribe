import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Header } from "../src/components/Header";

// Mock framer-motion
vi.mock("framer-motion", () => ({
	m: {
		header: ({
			children,
			className,
			"data-testid": testId,
			"data-scrolled": scrolled,
			...props
		}: React.HTMLAttributes<HTMLElement> & {
			"data-testid"?: string;
			"data-scrolled"?: boolean;
		}) => (
			<header className={className} data-testid={testId} data-scrolled={scrolled} {...props}>
				{children}
			</header>
		),
		a: ({
			children,
			className,
			href,
			"data-testid": testId,
			...props
		}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { "data-testid"?: string }) => (
			<a className={className} href={href} data-testid={testId} {...props}>
				{children}
			</a>
		),
		div: ({
			children,
			className,
			"data-testid": testId,
			onClick,
			...props
		}: React.HTMLAttributes<HTMLDivElement> & { "data-testid"?: string }) => (
			<div className={className} data-testid={testId} onClick={onClick} {...props}>
				{children}
			</div>
		),
		svg: ({
			children,
			className,
			...props
		}: React.SVGProps<SVGSVGElement>) => (
			<svg className={className} {...props}>
				{children}
			</svg>
		),
	},
	AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock UserAvatar
vi.mock("../src/components/UserAvatar", () => ({
	UserAvatar: () => <div data-testid="user-avatar">UserAvatar</div>,
}));

// Mock MotionWrapper
vi.mock("../src/components/MotionWrapper", () => ({
	MotionWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("Header", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		document.body.style.overflow = "";
	});

	describe("Rendering", () => {
		it("renders the header element", () => {
			render(<Header />);
			expect(screen.getByTestId("header")).toBeInTheDocument();
		});

		it("renders the logo with default link", () => {
			render(<Header />);
			const logo = screen.getByTestId("header-logo");
			expect(logo).toBeInTheDocument();
			expect(logo).toHaveAttribute("href", "/");
		});

		it("renders the logo with custom link", () => {
			render(<Header logoHref="/library" />);
			const logo = screen.getByTestId("header-logo");
			expect(logo).toHaveAttribute("href", "/library");
		});

		it("renders the YTScribe text", () => {
			render(<Header />);
			expect(screen.getByText("YTScribe")).toBeInTheDocument();
		});

		it("renders the logo icon", () => {
			render(<Header />);
			const logo = screen.getByTestId("header-logo");
			expect(logo.querySelector("svg")).toBeInTheDocument();
		});
	});

	describe("Navigation Links", () => {
		const navLinks = [
			{ label: "Home", href: "/" },
			{ label: "Features", href: "#features" },
			{ label: "Pricing", href: "/pricing" },
		];

		it("renders navigation links", () => {
			render(<Header navLinks={navLinks} />);
			navLinks.forEach((link) => {
				expect(screen.getByText(link.label)).toBeInTheDocument();
			});
		});

		it("navigation links have correct hrefs", () => {
			render(<Header navLinks={navLinks} />);
			navLinks.forEach((link) => {
				const navLink = screen.getByText(link.label);
				expect(navLink.closest("a")).toHaveAttribute("href", link.href);
			});
		});

		it("renders no navigation links by default", () => {
			render(<Header />);
			const nav = screen.getByLabelText("Main navigation");
			expect(nav.children).toHaveLength(0);
		});
	});

	describe("User Avatar", () => {
		it("shows user avatar by default", () => {
			render(<Header />);
			// Desktop avatar is always visible; mobile avatar appears in mobile menu
			expect(screen.getByTestId("user-avatar")).toBeInTheDocument();
		});

		it("shows user avatar in mobile menu when open", () => {
			render(<Header />);
			fireEvent.click(screen.getByTestId("mobile-menu-button"));
			expect(screen.getAllByTestId("user-avatar")).toHaveLength(2); // Desktop + mobile
		});

		it("hides user avatar when showAuth is false", () => {
			render(<Header showAuth={false} />);
			expect(screen.queryByTestId("user-avatar")).not.toBeInTheDocument();
		});
	});

	describe("Mobile Menu Button", () => {
		it("renders mobile menu button", () => {
			render(<Header />);
			expect(screen.getByTestId("mobile-menu-button")).toBeInTheDocument();
		});

		it("mobile menu button has correct aria-label when closed", () => {
			render(<Header />);
			const button = screen.getByTestId("mobile-menu-button");
			expect(button).toHaveAttribute("aria-label", "Open menu");
			expect(button).toHaveAttribute("aria-expanded", "false");
		});

		it("opens mobile menu when button is clicked", () => {
			render(<Header />);
			const button = screen.getByTestId("mobile-menu-button");

			fireEvent.click(button);

			expect(screen.getByTestId("mobile-menu")).toBeInTheDocument();
			expect(button).toHaveAttribute("aria-label", "Close menu");
			expect(button).toHaveAttribute("aria-expanded", "true");
		});

		it("closes mobile menu when button is clicked again", () => {
			render(<Header />);
			const button = screen.getByTestId("mobile-menu-button");

			fireEvent.click(button);
			expect(screen.getByTestId("mobile-menu")).toBeInTheDocument();

			fireEvent.click(button);
			expect(screen.queryByTestId("mobile-menu")).not.toBeInTheDocument();
		});
	});

	describe("Mobile Menu", () => {
		const navLinks = [
			{ label: "Home", href: "/" },
			{ label: "Features", href: "#features" },
		];

		it("renders mobile menu with navigation links", () => {
			render(<Header navLinks={navLinks} />);
			fireEvent.click(screen.getByTestId("mobile-menu-button"));

			const mobileMenu = screen.getByTestId("mobile-menu");
			navLinks.forEach((link) => {
				expect(mobileMenu).toHaveTextContent(link.label);
			});
		});

		it("closes mobile menu when backdrop is clicked", () => {
			render(<Header />);
			fireEvent.click(screen.getByTestId("mobile-menu-button"));

			expect(screen.getByTestId("mobile-menu")).toBeInTheDocument();

			fireEvent.click(screen.getByTestId("mobile-menu-backdrop"));

			expect(screen.queryByTestId("mobile-menu")).not.toBeInTheDocument();
		});

		it("closes mobile menu when Escape key is pressed", () => {
			render(<Header />);
			fireEvent.click(screen.getByTestId("mobile-menu-button"));

			expect(screen.getByTestId("mobile-menu")).toBeInTheDocument();

			fireEvent.keyDown(document, { key: "Escape" });

			expect(screen.queryByTestId("mobile-menu")).not.toBeInTheDocument();
		});

		it("closes mobile menu when a nav link is clicked", () => {
			render(<Header navLinks={navLinks} />);
			fireEvent.click(screen.getByTestId("mobile-menu-button"));

			const mobileMenu = screen.getByTestId("mobile-menu");
			const homeLink = mobileMenu.querySelector('a[href="/"]');
			expect(homeLink).toBeInTheDocument();

			fireEvent.click(homeLink!);

			expect(screen.queryByTestId("mobile-menu")).not.toBeInTheDocument();
		});

		it("prevents body scroll when mobile menu is open", () => {
			render(<Header />);

			expect(document.body.style.overflow).toBe("");

			fireEvent.click(screen.getByTestId("mobile-menu-button"));
			expect(document.body.style.overflow).toBe("hidden");

			fireEvent.click(screen.getByTestId("mobile-menu-button"));
			expect(document.body.style.overflow).toBe("");
		});
	});

	describe("Scroll Behavior", () => {
		it("starts with scrolled state as false", () => {
			render(<Header />);
			expect(screen.getByTestId("header")).toHaveAttribute(
				"data-scrolled",
				"false"
			);
		});

		it("updates scrolled state on scroll", async () => {
			render(<Header />);

			// Simulate scroll
			Object.defineProperty(window, "scrollY", { value: 50, writable: true });
			fireEvent.scroll(window);

			await waitFor(() => {
				expect(screen.getByTestId("header")).toHaveAttribute(
					"data-scrolled",
					"true"
				);
			});
		});

		it("resets scrolled state when scrolling back to top", async () => {
			render(<Header />);

			// Scroll down
			Object.defineProperty(window, "scrollY", { value: 50, writable: true });
			fireEvent.scroll(window);

			await waitFor(() => {
				expect(screen.getByTestId("header")).toHaveAttribute(
					"data-scrolled",
					"true"
				);
			});

			// Scroll back up
			Object.defineProperty(window, "scrollY", { value: 5, writable: true });
			fireEvent.scroll(window);

			await waitFor(() => {
				expect(screen.getByTestId("header")).toHaveAttribute(
					"data-scrolled",
					"false"
				);
			});
		});
	});

	describe("Transparent Mode", () => {
		it("uses transparent background when transparent prop is true", () => {
			render(<Header transparent />);
			const header = screen.getByTestId("header");
			expect(header.className).toContain("bg-transparent");
		});

		it("uses solid background when transparent prop is false", () => {
			render(<Header transparent={false} />);
			const header = screen.getByTestId("header");
			expect(header.className).not.toContain("bg-transparent");
		});
	});

	describe("Custom Styling", () => {
		it("applies custom className", () => {
			render(<Header className="custom-class" />);
			expect(screen.getByTestId("header")).toHaveClass("custom-class");
		});
	});

	describe("Accessibility", () => {
		it("has main navigation landmark", () => {
			render(<Header />);
			expect(screen.getByLabelText("Main navigation")).toBeInTheDocument();
		});

		it("has mobile navigation landmark when menu is open", () => {
			render(<Header />);
			fireEvent.click(screen.getByTestId("mobile-menu-button"));
			expect(screen.getByLabelText("Mobile navigation")).toBeInTheDocument();
		});

		it("logo icon has aria-hidden for screen readers", () => {
			render(<Header />);
			const logo = screen.getByTestId("header-logo");
			const svg = logo.querySelector("svg");
			expect(svg).toHaveAttribute("aria-hidden", "true");
		});
	});
});
