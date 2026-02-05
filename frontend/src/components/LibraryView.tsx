import { useState, useEffect, useCallback, useRef } from "react";
import { m, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/astro/react";
import { VideoGrid, type VideoItem } from "./VideoGrid";
import { MotionWrapper } from "./MotionWrapper";
import { AddVideoModal } from "./AddVideoModal";

/**
 * API configuration
 */
const API_BASE_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3001";

/**
 * Fetch videos from the API with provided token
 */
async function fetchVideos(token: string | null): Promise<{
	videos: VideoItem[];
	pagination: { limit: number; offset: number; count: number };
}> {
	const headers: HeadersInit = {};
	if (token) {
		headers["Authorization"] = `Bearer ${token}`;
	}

	const response = await fetch(`${API_BASE_URL}/api/videos?limit=100`, {
		headers,
	});

	if (response.status === 401) {
		throw new Error("UNAUTHORIZED");
	}

	if (!response.ok) {
		throw new Error("Failed to fetch videos");
	}

	return response.json() as Promise<{
		videos: VideoItem[];
		pagination: { limit: number; offset: number; count: number };
	}>;
}

/**
 * Hook to monitor processing videos and trigger refresh when complete
 */
function useProcessingVideoMonitor(videos: VideoItem[], onRefresh: () => void) {
	const eventSourcesRef = useRef<Map<number, EventSource>>(new Map());

	useEffect(() => {
		// Find all processing/pending videos
		const processingVideos = videos.filter(
			(v) => v.status === "processing" || v.status === "pending",
		);

		// Close connections for videos no longer processing
		for (const [videoId, es] of eventSourcesRef.current.entries()) {
			if (!processingVideos.some((v) => v.id === videoId)) {
				es.close();
				eventSourcesRef.current.delete(videoId);
			}
		}

		// Create connections for new processing videos
		for (const video of processingVideos) {
			if (!eventSourcesRef.current.has(video.id)) {
				const url = `${API_BASE_URL}/api/videos/${video.id}/status/stream`;
				const es = new EventSource(url, { withCredentials: true });

				es.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data);
						if (data.stage === "complete" || data.stage === "error") {
							es.close();
							eventSourcesRef.current.delete(video.id);
							// Refresh the video list
							onRefresh();
						}
					} catch {
						// Ignore parse errors
					}
				};

				es.onerror = () => {
					es.close();
					eventSourcesRef.current.delete(video.id);
				};

				eventSourcesRef.current.set(video.id, es);
			}
		}

		// Cleanup on unmount
		return () => {
			for (const es of eventSourcesRef.current.values()) {
				es.close();
			}
			eventSourcesRef.current.clear();
		};
	}, [videos, onRefresh]);
}

interface LibraryViewProps {
	/** Initial videos passed from server (optional) */
	initialVideos?: VideoItem[];
}

/**
 * LibraryView component - main view for the video library page
 * Handles fetching videos, displaying grid, and navigation
 */
export function LibraryView({ initialVideos }: LibraryViewProps) {
	const { isLoaded, isSignedIn, getToken } = useAuth();
	const [videos, setVideos] = useState<VideoItem[]>(initialVideos || []);
	const [isLoading, setIsLoading] = useState(!initialVideos);
	const [error, setError] = useState<string | null>(null);
	const [isUnauthorized, setIsUnauthorized] = useState(false);
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);

	const loadVideos = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);
			const token = await getToken();
			const data = await fetchVideos(token);
			setVideos(data.videos);
		} catch (err) {
			if (err instanceof Error && err.message === "UNAUTHORIZED") {
				setIsUnauthorized(true);
			} else {
				setError("Failed to load videos. Please try again.");
			}
		} finally {
			setIsLoading(false);
		}
	}, [getToken]);

	// Only fetch videos once Clerk is loaded and user is signed in
	useEffect(() => {
		if (!initialVideos && isLoaded && isSignedIn) {
			loadVideos();
		} else if (isLoaded && !isSignedIn) {
			setIsUnauthorized(true);
			setIsLoading(false);
		}
	}, [initialVideos, isLoaded, isSignedIn, loadVideos]);

	// Monitor processing videos for real-time updates
	useProcessingVideoMonitor(videos, loadVideos);

	// Handle video click - navigate to video detail page
	const handleVideoClick = (video: VideoItem) => {
		if (video.status === "completed") {
			window.location.href = `/video/${video.id}`;
		}
	};

	// Handle redirect to login
	if (isUnauthorized) {
		return (
			<MotionWrapper>
				<m.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="flex flex-col items-center justify-center py-16 px-4"
				>
					<div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
						<svg
							className="h-8 w-8 text-neutral-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={1.5}
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
							/>
						</svg>
					</div>
					<h2 className="mb-2 text-xl font-semibold text-neutral-900">
						Sign in required
					</h2>
					<p className="mb-6 text-center text-neutral-500">
						Please sign in to access your video library.
					</p>
					<a
						href="/login"
						className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 font-medium text-white shadow-sm transition-all hover:bg-primary-700 hover:shadow-md"
					>
						Sign in with Google
						<svg
							className="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M13 7l5 5m0 0l-5 5m5-5H6"
							/>
						</svg>
					</a>
				</m.div>
			</MotionWrapper>
		);
	}

	// Handle error state
	if (error) {
		return (
			<MotionWrapper>
				<m.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="flex flex-col items-center justify-center py-16 px-4"
				>
					<div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-error-500/10">
						<svg
							className="h-8 w-8 text-error-500"
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
					</div>
					<h2 className="mb-2 text-xl font-semibold text-neutral-900">
						Something went wrong
					</h2>
					<p className="mb-6 text-center text-neutral-500">{error}</p>
					<button
						onClick={loadVideos}
						className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 font-medium text-white shadow-sm transition-all hover:bg-primary-700 hover:shadow-md"
					>
						<svg
							className="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
							/>
						</svg>
						Try again
					</button>
				</m.div>
			</MotionWrapper>
		);
	}

	return (
		<MotionWrapper>
			<m.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.3 }}
			>
				{/* Header */}
				<div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<m.h1
							initial={{ opacity: 0, y: -10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.1 }}
							className="text-2xl font-bold text-neutral-900"
						>
							Your Library
						</m.h1>
						<m.p
							initial={{ opacity: 0, y: -10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.15 }}
							className="mt-1 text-sm text-neutral-500"
						>
							{videos.length === 0
								? "Add your first video to get started"
								: `${videos.length} video${videos.length === 1 ? "" : "s"} in your library`}
						</m.p>
					</div>

					{/* Add Video button */}
					<m.button
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ delay: 0.2 }}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
						onClick={() => setIsAddModalOpen(true)}
						className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700"
					>
						<svg
							className="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M12 4v16m8-8H4"
							/>
						</svg>
						Add Video
					</m.button>
				</div>

				{/* Video Grid */}
				<AnimatePresence mode="wait">
					<VideoGrid
						videos={videos}
						onVideoClick={handleVideoClick}
						isLoading={isLoading}
					/>
				</AnimatePresence>

				{/* Add Video Modal */}
				<AddVideoModal
					isOpen={isAddModalOpen}
					onClose={() => setIsAddModalOpen(false)}
					onSuccess={(video) => {
						// Add the new video to the beginning of the list
						setVideos((prev) => [
							{
								id: video.id,
								youtubeId: video.youtubeId,
								youtubeUrl: video.youtubeUrl,
								title: null,
								duration: null,
								thumbnailUrl: null,
								status: video.status as VideoItem["status"],
								createdAt: video.createdAt,
								updatedAt: video.createdAt,
							},
							...prev,
						]);
					}}
				/>
			</m.div>
		</MotionWrapper>
	);
}
