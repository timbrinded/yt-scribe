import { useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { MotionWrapper } from "./MotionWrapper";
import { useClerkAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { UserProfile } from "@clerk/astro/react";

interface SettingsViewProps {
	className?: string;
}

/**
 * Settings view component displaying user profile via Clerk and account management options
 */
export function SettingsView({ className = "" }: SettingsViewProps) {
	const { signOut, isLoaded } = useClerkAuth();
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [deleteConfirmText, setDeleteConfirmText] = useState("");
	const [error, setError] = useState<string | null>(null);

	// Handle logout via Clerk
	async function handleLogout() {
		await signOut();
		window.location.href = "/";
	}

	// Handle account deletion
	async function handleDeleteAccount() {
		if (deleteConfirmText !== "DELETE") {
			return;
		}

		try {
			setIsDeleting(true);
			const response = await apiFetch("/api/account", {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Failed to delete account");
			}

			// Sign out of Clerk after deleting account
			await signOut();
			window.location.href = "/";
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete account");
			setIsDeleting(false);
			setShowDeleteConfirm(false);
		}
	}

	if (!isLoaded) {
		return (
			<MotionWrapper>
				<div className={`animate-pulse ${className}`}>
					<div className="h-8 w-48 rounded bg-neutral-200" />
					<div className="mt-4 h-64 rounded-2xl bg-neutral-200" />
				</div>
			</MotionWrapper>
		);
	}

	return (
		<MotionWrapper>
			<m.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.3 }}
				className={className}
			>
				{/* Header */}
				<m.h1
					initial={{ opacity: 0, y: -10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.1 }}
					className="mb-8 text-2xl font-bold text-neutral-900"
				>
					Settings
				</m.h1>

				{/* Error message */}
				<AnimatePresence>
					{error && (
						<m.div
							initial={{ opacity: 0, y: -10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							className="mb-6 rounded-lg bg-error-500/10 p-4 text-error-700"
						>
							{error}
						</m.div>
					)}
				</AnimatePresence>

				{/* Clerk User Profile Component */}
				<m.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.2 }}
					className="mb-8"
				>
					<UserProfile
						appearance={{
							elements: {
								rootBox: "w-full",
								card: "shadow-lg ring-1 ring-neutral-900/5",
							},
						}}
					/>
				</m.div>

				{/* Danger Zone */}
				<m.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.3 }}
					className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-neutral-900/5"
				>
					<h2 className="mb-4 text-lg font-semibold text-error-600">
						Danger Zone
					</h2>

					<div className="flex items-center justify-between rounded-lg border border-error-200 bg-error-50/50 p-4">
						<div>
							<h3 className="font-medium text-neutral-900">Delete Account</h3>
							<p className="text-sm text-neutral-500">
								Permanently delete your account and all associated data
							</p>
						</div>
						<button
							onClick={() => setShowDeleteConfirm(true)}
							className="rounded-lg bg-error-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-error-700"
						>
							Delete Account
						</button>
					</div>
				</m.div>

				{/* Delete Confirmation Modal */}
				<AnimatePresence>
					{showDeleteConfirm && (
						<>
							{/* Backdrop */}
							<m.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								onClick={() => !isDeleting && setShowDeleteConfirm(false)}
								className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
							/>

							{/* Modal */}
							<m.div
								initial={{ opacity: 0, scale: 0.95 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.95 }}
								className="fixed inset-0 z-50 flex items-center justify-center p-4"
							>
								<div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
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
										Are you absolutely sure?
									</h3>
									<p className="mb-4 text-sm text-neutral-500">
										This action cannot be undone. This will permanently delete
										your account and remove all your data including videos,
										transcripts, and chat history.
									</p>
									<div className="mb-4">
										<label className="mb-1 block text-sm font-medium text-neutral-700">
											Type DELETE to confirm
										</label>
										<input
											type="text"
											value={deleteConfirmText}
											onChange={(e) => setDeleteConfirmText(e.target.value)}
											className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-error-500 focus:outline-none focus:ring-2 focus:ring-error-500/20"
											placeholder="DELETE"
											disabled={isDeleting}
										/>
									</div>
									<div className="flex gap-3">
										<button
											onClick={() => {
												setShowDeleteConfirm(false);
												setDeleteConfirmText("");
											}}
											disabled={isDeleting}
											className="flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
										>
											Cancel
										</button>
										<button
											onClick={handleDeleteAccount}
											disabled={isDeleting || deleteConfirmText !== "DELETE"}
											className="flex-1 rounded-lg bg-error-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-error-700 disabled:opacity-50"
										>
											{isDeleting ? "Deleting..." : "Delete Account"}
										</button>
									</div>
								</div>
							</m.div>
						</>
					)}
				</AnimatePresence>
			</m.div>
		</MotionWrapper>
	);
}
