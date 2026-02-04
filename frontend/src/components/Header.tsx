import { useState, useEffect, useRef } from "react";
import { m, AnimatePresence } from "framer-motion";
import { MotionWrapper } from "./MotionWrapper";
import { UserAvatar } from "./UserAvatar";

interface NavLink {
	label: string;
	href: string;
}

interface HeaderProps {
	/** Logo link destination, defaults to "/" */
	logoHref?: string;
	/** Navigation links to display */
	navLinks?: NavLink[];
	/** Whether to show the user avatar/auth button */
	showAuth?: boolean;
	/** Whether to use transparent background (for landing page hero) */
	transparent?: boolean;
	/** Optional class name for custom styling */
	className?: string;
}

/**
 * Header component with responsive navigation, scroll animations, and mobile menu
 */
export function Header({
	logoHref = "/",
	navLinks = [],
	showAuth = true,
	transparent = false,
	className = "",
}: HeaderProps) {
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
	const [isScrolled, setIsScrolled] = useState(false);
	const headerRef = useRef<HTMLElement>(null);

	// Handle scroll for shrink/shadow effect
	useEffect(() => {
		function handleScroll() {
			setIsScrolled(window.scrollY > 10);
		}

		window.addEventListener("scroll", handleScroll, { passive: true });
		handleScroll(); // Check initial state

		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	// Close mobile menu on escape key
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setIsMobileMenuOpen(false);
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	// Close mobile menu on resize to desktop
	useEffect(() => {
		function handleResize() {
			if (window.innerWidth >= 768) {
				setIsMobileMenuOpen(false);
			}
		}

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	// Prevent body scroll when mobile menu is open
	useEffect(() => {
		if (isMobileMenuOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}

		return () => {
			document.body.style.overflow = "";
		};
	}, [isMobileMenuOpen]);

	// Determine background style based on scroll and transparency
	const getBackgroundClasses = () => {
		if (isScrolled) {
			return "bg-white/95 shadow-sm backdrop-blur-md border-b border-neutral-200/50";
		}
		if (transparent) {
			return "bg-transparent";
		}
		return "bg-white/80 backdrop-blur-md border-b border-neutral-200/50";
	};

	return (
		<MotionWrapper>
			<m.header
				ref={headerRef}
				initial={false}
				animate={{
					height: isScrolled ? 60 : 72,
				}}
				transition={{ duration: 0.2, ease: "easeOut" }}
				className={`fixed left-0 right-0 top-0 z-50 ${getBackgroundClasses()} ${className}`}
				data-testid="header"
				data-scrolled={isScrolled}
			>
				<div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4">
					{/* Logo */}
					<m.a
						href={logoHref}
						className="flex items-center gap-2 text-xl font-bold text-neutral-900"
						animate={{
							scale: isScrolled ? 0.95 : 1,
						}}
						transition={{ duration: 0.2, ease: "easeOut" }}
						data-testid="header-logo"
					>
						<svg
							className="h-7 w-7 text-primary-600"
							viewBox="0 0 24 24"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
							aria-hidden="true"
						>
							<path
								d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
								stroke="currentColor"
								strokeWidth="2"
							/>
							<path d="M10 9L15 12L10 15V9Z" fill="currentColor" />
						</svg>
						<span>YTScribe</span>
					</m.a>

					{/* Desktop navigation */}
					<nav
						className="hidden items-center gap-8 md:flex"
						aria-label="Main navigation"
					>
						{navLinks.map((link) => (
							<a
								key={link.href}
								href={link.href}
								className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
							>
								{link.label}
							</a>
						))}
					</nav>

					{/* Desktop auth + mobile menu button */}
					<div className="flex items-center gap-4">
						{/* Desktop auth */}
						{showAuth && (
							<div className="hidden md:block">
								<UserAvatar />
							</div>
						)}

						{/* Mobile menu button */}
						<button
							onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
							className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 md:hidden"
							aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
							aria-expanded={isMobileMenuOpen}
							data-testid="mobile-menu-button"
						>
							<AnimatePresence mode="wait">
								{isMobileMenuOpen ? (
									<m.svg
										key="close"
										initial={{ opacity: 0, rotate: -90 }}
										animate={{ opacity: 1, rotate: 0 }}
										exit={{ opacity: 0, rotate: 90 }}
										transition={{ duration: 0.15 }}
										className="h-6 w-6"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={2}
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M6 18L18 6M6 6l12 12"
										/>
									</m.svg>
								) : (
									<m.svg
										key="menu"
										initial={{ opacity: 0, rotate: 90 }}
										animate={{ opacity: 1, rotate: 0 }}
										exit={{ opacity: 0, rotate: -90 }}
										transition={{ duration: 0.15 }}
										className="h-6 w-6"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={2}
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M4 6h16M4 12h16M4 18h16"
										/>
									</m.svg>
								)}
							</AnimatePresence>
						</button>
					</div>
				</div>

				{/* Mobile menu */}
				<AnimatePresence>
					{isMobileMenuOpen && (
						<>
							{/* Backdrop */}
							<m.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.2 }}
								className="fixed inset-0 top-[60px] bg-black/20 backdrop-blur-sm md:hidden"
								onClick={() => setIsMobileMenuOpen(false)}
								data-testid="mobile-menu-backdrop"
							/>

							{/* Menu panel */}
							<m.div
								initial={{ opacity: 0, y: -10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -10 }}
								transition={{ duration: 0.2, ease: "easeOut" }}
								className="absolute left-0 right-0 top-full border-b border-neutral-200 bg-white shadow-lg md:hidden"
								data-testid="mobile-menu"
							>
								<nav
									className="flex flex-col p-4"
									aria-label="Mobile navigation"
								>
									{navLinks.map((link, index) => (
										<m.a
											key={link.href}
											href={link.href}
											initial={{ opacity: 0, x: -10 }}
											animate={{ opacity: 1, x: 0 }}
											transition={{ delay: index * 0.05, duration: 0.2 }}
											className="rounded-lg px-4 py-3 text-base font-medium text-neutral-700 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
											onClick={() => setIsMobileMenuOpen(false)}
										>
											{link.label}
										</m.a>
									))}

									{/* Mobile auth section */}
									{showAuth && (
										<m.div
											initial={{ opacity: 0, x: -10 }}
											animate={{ opacity: 1, x: 0 }}
											transition={{
												delay: navLinks.length * 0.05,
												duration: 0.2,
											}}
											className="mt-4 border-t border-neutral-100 pt-4"
										>
											<UserAvatar />
										</m.div>
									)}
								</nav>
							</m.div>
						</>
					)}
				</AnimatePresence>
			</m.header>

			{/* Spacer to prevent content from going under fixed header */}
			<m.div
				animate={{
					height: isScrolled ? 60 : 72,
				}}
				transition={{ duration: 0.2, ease: "easeOut" }}
				aria-hidden="true"
			/>
		</MotionWrapper>
	);
}
