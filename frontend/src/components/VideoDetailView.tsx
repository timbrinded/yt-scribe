import { useState, useEffect, useCallback } from "react";
import { MotionWrapper } from "./MotionWrapper";
import { m } from "framer-motion";
import { TranscriptPanel, TranscriptSkeleton } from "./TranscriptPanel";
import { ChatInterface } from "./ChatInterface";
import { ProcessingAnimation } from "./ProcessingAnimation";
import { useVideoStatus } from "../hooks/useVideoStatus";
import {
	TimestampNavigationProvider,
	useTimestampNavigation,
} from "../contexts/TimestampNavigationContext";
import { apiFetch } from "../lib/api";
import type { TranscriptSegment } from "./TranscriptPanel";

/**
 * Video status type
 */
type VideoStatus = "pending" | "processing" | "completed" | "failed";

/**
 * Video detail response from API
 */
interface VideoDetail {
	id: number;
	youtubeUrl: string;
	youtubeId: string;
	title: string | null;
	duration: number | null;
	thumbnailUrl: string | null;
	status: VideoStatus;
	createdAt: string;
	updatedAt: string;
	transcript: {
		id: number;
		content: string;
		segments: TranscriptSegment[];
		language: string;
		createdAt: string;
	} | null;
}

interface VideoDetailViewProps {
	/** Video ID from the URL */
	videoId: number;
}

/**
 * Format duration in seconds to HH:MM:SS or MM:SS
 */
function formatDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	}
	return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: VideoStatus }) {
	const configs: Record<
		VideoStatus,
		{ label: string; className: string; icon?: React.ReactNode }
	> = {
		pending: {
			label: "Pending",
			className: "bg-neutral-100 text-neutral-600",
		},
		processing: {
			label: "Processing",
			className: "bg-primary-100 text-primary-700",
			icon: (
				<svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
					<circle
						className="opacity-25"
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						strokeWidth="4"
					/>
					<path
						className="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					/>
				</svg>
			),
		},
		completed: {
			label: "Ready",
			className: "bg-green-100 text-green-700",
		},
		failed: {
			label: "Failed",
			className: "bg-red-100 text-red-700",
		},
	};

	const config = configs[status];

	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}
		>
			{config.icon}
			{config.label}
		</span>
	);
}

/**
 * Loading skeleton for video header
 */
function HeaderSkeleton() {
	return (
		<div className="flex items-start gap-6 animate-pulse">
			<div className="h-24 w-40 shrink-0 rounded-lg bg-neutral-200" />
			<div className="flex-1 space-y-3">
				<div className="h-6 w-3/4 rounded bg-neutral-200" />
				<div className="h-4 w-1/4 rounded bg-neutral-200" />
				<div className="h-4 w-1/3 rounded bg-neutral-200" />
			</div>
		</div>
	);
}

/**
 * Video info header component
 */
function VideoHeader({ video }: { video: VideoDetail }) {
	const thumbnailUrl =
		video.thumbnailUrl ||
		`https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`;

	return (
		<div className="flex items-start gap-6">
			{/* Thumbnail */}
			<a
				href={video.youtubeUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="group relative shrink-0 overflow-hidden rounded-lg"
			>
				<img
					src={thumbnailUrl}
					alt={video.title || "Video thumbnail"}
					className="h-24 w-40 object-cover transition-transform group-hover:scale-105"
				/>
				{/* Play overlay */}
				<div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
					<svg
						className="h-10 w-10 text-white opacity-0 transition-opacity group-hover:opacity-100"
						fill="currentColor"
						viewBox="0 0 24 24"
					>
						<path d="M8 5v14l11-7z" />
					</svg>
				</div>
			</a>

			{/* Info */}
			<div className="flex-1 min-w-0">
				<div className="flex items-start justify-between gap-4">
					<h1 className="text-xl font-semibold text-neutral-900 truncate">
						{video.title || "Untitled Video"}
					</h1>
					<StatusBadge status={video.status} />
				</div>

				<div className="mt-2 flex items-center gap-4 text-sm text-neutral-500">
					{video.duration && (
						<span className="flex items-center gap-1.5">
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
									d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							{formatDuration(video.duration)}
						</span>
					)}

					<a
						href={video.youtubeUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1.5 hover:text-primary-600 transition-colors"
					>
						<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
							<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
						</svg>
						Watch on YouTube
					</a>
				</div>

				{/* Back to library link */}
				<a
					href="/library"
					className="mt-3 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-primary-600 transition-colors"
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
							d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
						/>
					</svg>
					Back to library
				</a>
			</div>
		</div>
	);
}

/**
 * Map backend video status to ProcessingAnimation stage
 */
function mapStatusToStage(
	status: VideoStatus,
	sseStage?: import("../hooks/useVideoStatus").ProcessingStage,
): import("./ProcessingAnimation").ProcessingStage {
	// If we have SSE data, use it
	if (sseStage) {
		// Map 'pending' from SSE to 'downloading' for better UX (processing just started)
		if (sseStage === "pending") return "downloading";
		return sseStage;
	}
	// Fallback to basic status
	if (status === "completed") return "complete";
	if (status === "failed") return "error";
	if (status === "processing") return "downloading";
	return "downloading"; // pending
}

/**
 * Processing state display with real-time SSE updates
 */
function ProcessingStateWithSSE({
	videoId,
	status,
	onComplete,
}: {
	videoId: number;
	status: VideoStatus;
	onComplete: () => void;
}) {
	const { stage, progress, error, isComplete } = useVideoStatus(
		videoId,
		status,
	);

	// When processing completes, trigger a refresh
	useEffect(() => {
		if (isComplete) {
			// Small delay to let the animation play
			const timer = setTimeout(onComplete, 1500);
			return () => clearTimeout(timer);
		}
	}, [isComplete, onComplete]);

	const animationStage = mapStatusToStage(status, stage);

	return (
		<MotionWrapper>
			<m.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				className="flex flex-col items-center justify-center py-12"
			>
				<ProcessingAnimation
					currentStage={animationStage}
					progress={progress}
					errorMessage={error}
				/>

				{status === "failed" && (
					<a
						href="/library"
						className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
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
						Go to Library to Retry
					</a>
				)}
			</m.div>
		</MotionWrapper>
	);
}

/**
 * Error state display
 */
function ErrorState({
	error,
	onRetry,
}: {
	error: string;
	onRetry?: () => void;
}) {
	return (
		<MotionWrapper>
			<m.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				className="flex flex-col items-center justify-center py-16 text-center"
			>
				<div className="mb-6 h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
					<svg
						className="h-8 w-8 text-red-600"
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
				<h2 className="text-lg font-semibold text-neutral-900">{error}</h2>
				{onRetry && (
					<button
						type="button"
						onClick={onRetry}
						className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
					>
						Try Again
					</button>
				)}
				<a
					href="/library"
					className="mt-4 text-sm text-neutral-500 hover:text-primary-600 transition-colors"
				>
					Back to library
				</a>
			</m.div>
		</MotionWrapper>
	);
}

/**
 * VideoDetailView - main component for the video detail page
 * Displays video info, transcript, and chat interface
 */
export function VideoDetailView({ videoId }: VideoDetailViewProps) {
	const [video, setVideo] = useState<VideoDetail | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchVideo = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			const response = await apiFetch(`/api/videos/${videoId}`);

			if (response.status === 401) {
				window.location.href = "/login";
				return;
			}

			if (response.status === 403) {
				setError("You don't have access to this video");
				return;
			}

			if (response.status === 404) {
				setError("Video not found");
				return;
			}

			if (!response.ok) {
				throw new Error(`Failed to fetch video: ${response.statusText}`);
			}

			const data = (await response.json()) as VideoDetail;
			setVideo(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load video");
		} finally {
			setIsLoading(false);
		}
	}, [videoId]);

	useEffect(() => {
		fetchVideo();
	}, [fetchVideo]);

	// Show loading skeleton
	if (isLoading) {
		return (
			<div className="flex flex-col h-full">
				<div className="border-b border-neutral-200 bg-white px-6 py-6">
					<HeaderSkeleton />
				</div>
				<div className="flex flex-1 overflow-hidden">
					<div className="w-1/2 border-r border-neutral-200">
						<TranscriptSkeleton />
					</div>
					<div className="w-1/2">
						{/* Chat skeleton */}
						<div className="flex flex-col items-center justify-center h-full p-8 animate-pulse">
							<div className="h-12 w-12 rounded-full bg-neutral-200 mb-4" />
							<div className="h-4 w-48 rounded bg-neutral-200 mb-2" />
							<div className="h-4 w-64 rounded bg-neutral-200" />
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Show error state
	if (error) {
		return (
			<div className="flex items-center justify-center h-full">
				<ErrorState error={error} onRetry={fetchVideo} />
			</div>
		);
	}

	// No video data
	if (!video) {
		return (
			<div className="flex items-center justify-center h-full">
				<ErrorState error="Video not found" />
			</div>
		);
	}

	// Show processing state for non-completed videos
	if (video.status !== "completed") {
		return (
			<div className="flex flex-col h-full">
				<div className="border-b border-neutral-200 bg-white px-6 py-6">
					<VideoHeader video={video} />
				</div>
				<div className="flex-1 overflow-auto">
					<ProcessingStateWithSSE
						videoId={video.id}
						status={video.status}
						onComplete={fetchVideo}
					/>
				</div>
			</div>
		);
	}

	// Main two-column layout for completed videos
	return (
		<TimestampNavigationProvider>
			<VideoDetailContent video={video} />
		</TimestampNavigationProvider>
	);
}

/**
 * Inner component that uses the TimestampNavigationContext
 */
function VideoDetailContent({ video }: { video: VideoDetail }) {
	const { activeSegmentIndex, navigateToSegment, setSegments } =
		useTimestampNavigation();

	// Set segments in context when transcript is available
	useEffect(() => {
		if (video.transcript?.segments) {
			setSegments(video.transcript.segments);
		}
	}, [video.transcript?.segments, setSegments]);

	return (
		<MotionWrapper>
			<m.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				className="flex flex-col h-full"
			>
				{/* Header */}
				<div className="border-b border-neutral-200 bg-white px-6 py-6">
					<VideoHeader video={video} />
				</div>

				{/* Two-column layout */}
				<div className="flex flex-1 overflow-hidden">
					{/* Transcript panel */}
					<div className="w-1/2 border-r border-neutral-200 bg-white flex flex-col">
						<div className="border-b border-neutral-200 px-4 py-3">
							<h2 className="font-medium text-neutral-900">Transcript</h2>
							{video.transcript && (
								<p className="text-xs text-neutral-500 mt-0.5">
									{video.transcript.segments.length} segments
								</p>
							)}
						</div>
						<div className="flex-1 overflow-hidden">
							{video.transcript ? (
								<TranscriptPanel
									segments={video.transcript.segments}
									className="h-full"
									activeSegmentIndex={activeSegmentIndex}
									onActiveSegmentChange={navigateToSegment}
								/>
							) : (
								<div className="flex items-center justify-center h-full">
									<p className="text-sm text-neutral-500">
										No transcript available
									</p>
								</div>
							)}
						</div>
					</div>

					{/* Chat panel */}
					<div className="w-1/2 flex flex-col bg-neutral-50">
						<div className="border-b border-neutral-200 bg-white px-4 py-3">
							<h2 className="font-medium text-neutral-900">Chat</h2>
							<p className="text-xs text-neutral-500 mt-0.5">
								Ask questions about this video
							</p>
						</div>
						<div className="flex-1 overflow-hidden">
							<ChatInterface videoId={video.id} className="h-full" />
						</div>
					</div>
				</div>
			</m.div>
		</MotionWrapper>
	);
}
