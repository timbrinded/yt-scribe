import { useState, useEffect, useRef } from "react";
import { m, AnimatePresence } from "framer-motion";
import { MotionWrapper } from "./MotionWrapper";

const API_BASE_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3000";

interface User {
	id: number;
	email: string;
	name: string | null;
	avatarUrl: string | null;
}

interface UserAvatarProps {
	/** Optional class name for the container */
	className?: string;
}

/**
 * UserAvatar component displays the user's avatar with a dropdown menu
 * Shows login button if not authenticated
 */
export function UserAvatar({ className = "" }: UserAvatarProps) {
	const [user, setUser] = useState<User | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isOpen, setIsOpen] = useState(false);
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Fetch user on mount
	useEffect(() => {
		async function fetchUser() {
			try {
				const response = await fetch(`${API_BASE_URL}/auth/me`, {
					credentials: "include",
				});

				if (response.ok) {
					const userData = (await response.json()) as User;
					setUser(userData);
				}
			} catch {
				// User not logged in or network error
			} finally {
				setIsLoading(false);
			}
		}

		fetchUser();
	}, []);

	// Close dropdown on outside click
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// Handle logout
	async function handleLogout() {
		try {
			setIsLoggingOut(true);
			await fetch(`${API_BASE_URL}/auth/logout`, {
				method: "POST",
				credentials: "include",
			});
			window.location.href = "/";
		} catch {
			setIsLoggingOut(false);
		}
	}

	// Get user initials for fallback avatar
	function getInitials(name: string | null): string {
		if (!name) return "?";
		const parts = name.split(" ").filter(Boolean);
		if (parts.length >= 2) {
			return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
		}
		return parts[0]?.slice(0, 2).toUpperCase() ?? "?";
	}

	// Loading state
	if (isLoading) {
		return (
			<div
				className={`h-10 w-10 animate-pulse rounded-full bg-neutral-200 ${className}`}
			/>
		);
	}

	// Not logged in - show sign in button
	if (!user) {
		return (
			<a
				href="/login"
				className={`inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-primary-700 ${className}`}
			>
				Sign In
			</a>
		);
	}

	return (
		<MotionWrapper>
			<div ref={dropdownRef} className={`relative ${className}`}>
				{/* Avatar button */}
				<button
					onClick={() => setIsOpen(!isOpen)}
					className="flex items-center gap-2 rounded-full p-0.5 ring-2 ring-transparent transition-all hover:ring-primary-200 focus:outline-none focus:ring-primary-300"
					aria-label="Open user menu"
					aria-expanded={isOpen}
				>
					{user.avatarUrl ? (
						<img
							src={user.avatarUrl}
							alt={user.name ?? "User avatar"}
							className="h-9 w-9 rounded-full object-cover"
						/>
					) : (
						<div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
							{getInitials(user.name)}
						</div>
					)}
				</button>

				{/* Dropdown menu */}
				<AnimatePresence>
					{isOpen && (
						<m.div
							initial={{ opacity: 0, scale: 0.95, y: -10 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95, y: -10 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							className="absolute right-0 z-50 mt-2 w-64 origin-top-right rounded-xl bg-white shadow-lg ring-1 ring-neutral-900/5"
						>
							{/* User info */}
							<div className="border-b border-neutral-100 px-4 py-3">
								<p className="text-sm font-medium text-neutral-900 truncate">
									{user.name ?? "User"}
								</p>
								<p className="text-sm text-neutral-500 truncate">
									{user.email}
								</p>
							</div>

							{/* Menu items */}
							<div className="p-1">
								<a
									href="/library"
									className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50"
								>
									<svg
										className="h-4 w-4 text-neutral-400"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={1.5}
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
										/>
									</svg>
									My Library
								</a>
								<a
									href="/settings"
									className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50"
								>
									<svg
										className="h-4 w-4 text-neutral-400"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={1.5}
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
										/>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
										/>
									</svg>
									Settings
								</a>
							</div>

							{/* Logout */}
							<div className="border-t border-neutral-100 p-1">
								<button
									onClick={handleLogout}
									disabled={isLoggingOut}
									className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-error-600 transition-colors hover:bg-error-50 disabled:opacity-50"
								>
									<svg
										className="h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={1.5}
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
										/>
									</svg>
									{isLoggingOut ? "Signing out..." : "Sign out"}
								</button>
							</div>
						</m.div>
					)}
				</AnimatePresence>
			</div>
		</MotionWrapper>
	);
}
