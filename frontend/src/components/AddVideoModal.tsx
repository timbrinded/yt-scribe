import { useState, useCallback, useRef, useEffect } from "react";
import { m, AnimatePresence } from "framer-motion";
import { MotionWrapper } from "./MotionWrapper";

const API_BASE_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3000";

/**
 * Validate YouTube URL format
 * Supports: youtube.com/watch, youtu.be, youtube.com/embed, youtube.com/shorts, youtube.com/live
 */
function isValidYouTubeUrl(url: string): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname.replace("www.", "");

		// youtu.be short URLs
		if (hostname === "youtu.be") {
			return parsed.pathname.length > 1;
		}

		// youtube.com URLs
		if (hostname === "youtube.com" || hostname === "m.youtube.com") {
			// /watch?v=ID
			if (parsed.pathname === "/watch" && parsed.searchParams.has("v")) {
				return parsed.searchParams.get("v")?.length === 11;
			}
			// /embed/ID, /v/ID, /shorts/ID, /live/ID
			const pathMatch = parsed.pathname.match(/^\/(embed|v|shorts|live)\/([a-zA-Z0-9_-]{11})/);
			if (pathMatch) return true;
		}

		return false;
	} catch {
		return false;
	}
}

interface AddVideoResponse {
	id: number;
	youtubeUrl: string;
	youtubeId: string;
	status: string;
	createdAt: string;
}

interface AddVideoModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess?: (video: AddVideoResponse) => void;
}

/**
 * Modal component for adding a new YouTube video to the library
 */
export function AddVideoModal({ isOpen, onClose, onSuccess }: AddVideoModalProps) {
	const [url, setUrl] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isValidated, setIsValidated] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// Focus input when modal opens
	useEffect(() => {
		if (isOpen && inputRef.current) {
			// Small delay to allow animation to start
			const timeout = setTimeout(() => {
				inputRef.current?.focus();
			}, 100);
			return () => clearTimeout(timeout);
		}
	}, [isOpen]);

	// Reset state when modal closes
	useEffect(() => {
		if (!isOpen) {
			setUrl("");
			setError(null);
			setIsSubmitting(false);
			setIsValidated(false);
		}
	}, [isOpen]);

	// Handle escape key
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && isOpen && !isSubmitting) {
				onClose();
			}
		};
		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [isOpen, isSubmitting, onClose]);

	// Validate URL on blur
	const handleBlur = useCallback(() => {
		if (url.trim()) {
			if (isValidYouTubeUrl(url.trim())) {
				setError(null);
				setIsValidated(true);
			} else {
				setError("Please enter a valid YouTube URL");
				setIsValidated(false);
			}
		} else {
			setError(null);
			setIsValidated(false);
		}
	}, [url]);

	// Handle form submission
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmedUrl = url.trim();

		if (!trimmedUrl) {
			setError("Please enter a YouTube URL");
			return;
		}

		if (!isValidYouTubeUrl(trimmedUrl)) {
			setError("Please enter a valid YouTube URL");
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			const response = await fetch(`${API_BASE_URL}/api/videos`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
				body: JSON.stringify({ url: trimmedUrl }),
			});

			if (response.status === 401) {
				setError("Please sign in to add videos");
				return;
			}

			if (response.status === 409) {
				const data = await response.json();
				setError(`This video is already in your library (ID: ${data.existingVideoId})`);
				return;
			}

			if (response.status === 400) {
				const data = await response.json();
				setError(data.error || "Invalid YouTube URL");
				return;
			}

			if (!response.ok) {
				setError("Failed to add video. Please try again.");
				return;
			}

			const video = (await response.json()) as AddVideoResponse;
			onSuccess?.(video);
			onClose();
		} catch {
			setError("Network error. Please check your connection and try again.");
		} finally {
			setIsSubmitting(false);
		}
	};

	// Handle backdrop click
	const handleBackdropClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget && !isSubmitting) {
			onClose();
		}
	};

	return (
		<MotionWrapper>
			<AnimatePresence>
				{isOpen && (
					<m.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-sm"
						onClick={handleBackdropClick}
						data-testid="add-video-modal-backdrop"
					>
						<m.div
							initial={{ opacity: 0, scale: 0.95, y: 10 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95, y: 10 }}
							transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
							className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
							onClick={(e) => e.stopPropagation()}
							data-testid="add-video-modal"
						>
							{/* Header */}
							<div className="border-b border-neutral-100 px-6 py-4">
								<div className="flex items-center justify-between">
									<h2 className="text-lg font-semibold text-neutral-900">Add Video</h2>
									<button
										onClick={onClose}
										disabled={isSubmitting}
										className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50"
										aria-label="Close modal"
									>
										<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
											<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>
								<p className="mt-1 text-sm text-neutral-500">
									Paste a YouTube video URL to add it to your library
								</p>
							</div>

							{/* Form */}
							<form onSubmit={handleSubmit} className="p-6">
								<div className="space-y-4">
									{/* URL Input */}
									<div>
										<label htmlFor="youtube-url" className="block text-sm font-medium text-neutral-700">
											YouTube URL
										</label>
										<div className="relative mt-1.5">
											<div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
												<svg
													className={`h-5 w-5 transition-colors ${
														isValidated ? "text-success-500" : error ? "text-error-500" : "text-neutral-400"
													}`}
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													strokeWidth={1.5}
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
													/>
												</svg>
											</div>
											<input
												ref={inputRef}
												type="url"
												id="youtube-url"
												value={url}
												onChange={(e) => {
													setUrl(e.target.value);
													if (error) setError(null);
													setIsValidated(false);
												}}
												onBlur={handleBlur}
												disabled={isSubmitting}
												placeholder="https://www.youtube.com/watch?v=..."
												className={`block w-full rounded-lg border py-2.5 pl-10 pr-10 text-sm transition-colors placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:bg-neutral-50 disabled:text-neutral-500 ${
													error
														? "border-error-500 focus:border-error-500 focus:ring-error-500/20"
														: isValidated
															? "border-success-500 focus:border-success-500 focus:ring-success-500/20"
															: "border-neutral-300 focus:border-primary-500 focus:ring-primary-500/20"
												}`}
												data-testid="youtube-url-input"
											/>
											{/* Validation indicator */}
											<AnimatePresence>
												{(isValidated || error) && (
													<m.div
														initial={{ opacity: 0, scale: 0.5 }}
														animate={{ opacity: 1, scale: 1 }}
														exit={{ opacity: 0, scale: 0.5 }}
														className="absolute inset-y-0 right-0 flex items-center pr-3"
													>
														{isValidated ? (
															<svg className="h-5 w-5 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
																<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
															</svg>
														) : error ? (
															<svg className="h-5 w-5 text-error-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
																<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
															</svg>
														) : null}
													</m.div>
												)}
											</AnimatePresence>
										</div>

										{/* Error message */}
										<AnimatePresence>
											{error && (
												<m.p
													initial={{ opacity: 0, height: 0 }}
													animate={{ opacity: 1, height: "auto" }}
													exit={{ opacity: 0, height: 0 }}
													className="mt-2 text-sm text-error-500"
													data-testid="error-message"
												>
													{error}
												</m.p>
											)}
										</AnimatePresence>

										{/* Help text */}
										<p className="mt-2 text-xs text-neutral-400">
											Supports youtube.com, youtu.be, and YouTube Shorts URLs
										</p>
									</div>
								</div>

								{/* Actions */}
								<div className="mt-6 flex gap-3">
									<button
										type="button"
										onClick={onClose}
										disabled={isSubmitting}
										className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
									>
										Cancel
									</button>
									<button
										type="submit"
										disabled={isSubmitting || !url.trim()}
										className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
										data-testid="submit-button"
									>
										{isSubmitting ? (
											<span className="flex items-center justify-center gap-2">
												<svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
													<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
													<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
												</svg>
												Adding...
											</span>
										) : (
											"Add Video"
										)}
									</button>
								</div>
							</form>
						</m.div>
					</m.div>
				)}
			</AnimatePresence>
		</MotionWrapper>
	);
}
