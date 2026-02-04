import { useState, useEffect } from "react";
import { m, AnimatePresence } from "framer-motion";
import { MotionWrapper } from "./MotionWrapper";

const API_BASE_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3000";

interface User {
	id: number;
	email: string;
	name: string | null;
	avatarUrl: string | null;
}

interface SettingsViewProps {
	className?: string;
}

/**
 * Settings view component displaying user profile and account management options
 */
export function SettingsView({ className = "" }: SettingsViewProps) {
	const [user, setUser] = useState<User | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [deleteConfirmText, setDeleteConfirmText] = useState("");

	// Fetch user data on mount
	useEffect(() => {
		async function fetchUser() {
			try {
				const response = await fetch(`${API_BASE_URL}/auth/me`, {
					credentials: "include",
				});

				if (response.status === 401) {
					window.location.href = "/login";
					return;
				}

				if (!response.ok) {
					throw new Error("Failed to load profile");
				}

				const userData = (await response.json()) as User;
				setUser(userData);
			} catch (err) {
				setError(err instanceof Error ? err.message : "An error occurred");
			} finally {
				setIsLoading(false);
			}
		}

		fetchUser();
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

	// Handle account deletion
	async function handleDeleteAccount() {
		if (deleteConfirmText !== "DELETE") {
			return;
		}

		try {
			setIsDeleting(true);
			const response = await fetch(`${API_BASE_URL}/auth/account`, {
				method: "DELETE",
				credentials: "include",
			});

			if (!response.ok) {
				throw new Error("Failed to delete account");
			}

			window.location.href = "/";
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete account");
			setIsDeleting(false);
			setShowDeleteConfirm(false);
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

	if (isLoading) {
		return (
			<div className={`mx-auto max-w-2xl ${className}`}>
				<div className="animate-pulse space-y-6">
					<div className="h-8 w-32 rounded bg-neutral-200" />
					<div className="rounded-xl border border-neutral-200 bg-white p-6">
						<div className="flex items-center gap-4">
							<div className="h-16 w-16 rounded-full bg-neutral-200" />
							<div className="space-y-2">
								<div className="h-5 w-32 rounded bg-neutral-200" />
								<div className="h-4 w-48 rounded bg-neutral-200" />
							</div>
						</div>
					</div>
					<div className="rounded-xl border border-neutral-200 bg-white p-6">
						<div className="h-10 w-full rounded bg-neutral-200" />
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className={`mx-auto max-w-2xl ${className}`}>
				<div className="rounded-xl border border-error-200 bg-error-50 p-6 text-center">
					<svg
						className="mx-auto h-12 w-12 text-error-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={1.5}
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
						/>
					</svg>
					<p className="mt-4 text-error-700">{error}</p>
					<button
						onClick={() => window.location.reload()}
						className="mt-4 rounded-lg bg-error-600 px-4 py-2 text-sm font-medium text-white hover:bg-error-700"
					>
						Try Again
					</button>
				</div>
			</div>
		);
	}

	if (!user) {
		return null;
	}

	return (
		<MotionWrapper>
			<div className={`mx-auto max-w-2xl ${className}`}>
				<m.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3 }}
				>
					<h1 className="mb-6 text-2xl font-semibold text-neutral-900">
						Settings
					</h1>

					{/* Profile Section */}
					<div className="mb-6 rounded-xl border border-neutral-200 bg-white shadow-sm">
						<div className="border-b border-neutral-100 px-6 py-4">
							<h2 className="text-lg font-medium text-neutral-900">Profile</h2>
							<p className="text-sm text-neutral-500">
								Your account information from Google
							</p>
						</div>
						<div className="p-6">
							<div className="flex items-center gap-5">
								{user.avatarUrl ? (
									<img
										src={user.avatarUrl}
										alt={user.name ?? "User avatar"}
										className="h-16 w-16 rounded-full object-cover ring-2 ring-neutral-100"
									/>
								) : (
									<div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-xl font-medium text-primary-700 ring-2 ring-neutral-100">
										{getInitials(user.name)}
									</div>
								)}
								<div>
									<p className="text-lg font-medium text-neutral-900">
										{user.name ?? "User"}
									</p>
									<p className="text-neutral-500">{user.email}</p>
									<p className="mt-1 text-xs text-neutral-400">
										Signed in with Google
									</p>
								</div>
							</div>
						</div>
					</div>

					{/* Account Actions Section */}
					<div className="mb-6 rounded-xl border border-neutral-200 bg-white shadow-sm">
						<div className="border-b border-neutral-100 px-6 py-4">
							<h2 className="text-lg font-medium text-neutral-900">Account</h2>
							<p className="text-sm text-neutral-500">
								Manage your account settings
							</p>
						</div>
						<div className="p-6 space-y-4">
							{/* Logout Button */}
							<div className="flex items-center justify-between">
								<div>
									<p className="font-medium text-neutral-900">Sign out</p>
									<p className="text-sm text-neutral-500">
										Sign out of your account on this device
									</p>
								</div>
								<button
									onClick={handleLogout}
									disabled={isLoggingOut}
									className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
								>
									{isLoggingOut ? "Signing out..." : "Sign out"}
								</button>
							</div>
						</div>
					</div>

					{/* Danger Zone */}
					<div className="rounded-xl border border-error-200 bg-white shadow-sm">
						<div className="border-b border-error-100 bg-error-50/50 px-6 py-4">
							<h2 className="text-lg font-medium text-error-700">
								Danger Zone
							</h2>
							<p className="text-sm text-error-600">
								Irreversible and destructive actions
							</p>
						</div>
						<div className="p-6">
							<div className="flex items-center justify-between">
								<div>
									<p className="font-medium text-neutral-900">Delete account</p>
									<p className="text-sm text-neutral-500">
										Permanently delete your account and all data
									</p>
								</div>
								<button
									onClick={() => setShowDeleteConfirm(true)}
									className="rounded-lg border border-error-300 bg-white px-4 py-2 text-sm font-medium text-error-600 transition-colors hover:bg-error-50"
								>
									Delete account
								</button>
							</div>
						</div>
					</div>

					{/* Delete Confirmation Modal */}
					<AnimatePresence>
						{showDeleteConfirm && (
							<m.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
								onClick={() => {
									if (!isDeleting) {
										setShowDeleteConfirm(false);
										setDeleteConfirmText("");
									}
								}}
							>
								<m.div
									initial={{ opacity: 0, scale: 0.95 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.95 }}
									transition={{ duration: 0.15 }}
									className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
									onClick={(e) => e.stopPropagation()}
								>
									<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error-100">
										<svg
											className="h-6 w-6 text-error-600"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											strokeWidth={1.5}
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
											/>
										</svg>
									</div>
									<h3 className="mb-2 text-lg font-semibold text-neutral-900">
										Delete your account?
									</h3>
									<p className="mb-4 text-sm text-neutral-600">
										This action cannot be undone. This will permanently delete
										your account and remove all of your data including videos,
										transcripts, and chat history.
									</p>
									<div className="mb-4">
										<label
											htmlFor="delete-confirm"
											className="mb-2 block text-sm font-medium text-neutral-700"
										>
											Type <span className="font-mono font-bold">DELETE</span>{" "}
											to confirm
										</label>
										<input
											id="delete-confirm"
											type="text"
											value={deleteConfirmText}
											onChange={(e) => setDeleteConfirmText(e.target.value)}
											className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-error-500 focus:outline-none focus:ring-2 focus:ring-error-500/20"
											placeholder="DELETE"
											autoComplete="off"
										/>
									</div>
									<div className="flex gap-3">
										<button
											onClick={() => {
												setShowDeleteConfirm(false);
												setDeleteConfirmText("");
											}}
											disabled={isDeleting}
											className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
										>
											Cancel
										</button>
										<button
											onClick={handleDeleteAccount}
											disabled={deleteConfirmText !== "DELETE" || isDeleting}
											className="flex-1 rounded-lg bg-error-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-error-700 disabled:opacity-50"
										>
											{isDeleting ? "Deleting..." : "Delete account"}
										</button>
									</div>
								</m.div>
							</m.div>
						)}
					</AnimatePresence>
				</m.div>
			</div>
		</MotionWrapper>
	);
}
