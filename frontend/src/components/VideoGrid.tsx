import { m } from "framer-motion";
import { VideoCard, type VideoStatus } from "./VideoCard";
import { MotionWrapper } from "./MotionWrapper";

/**
 * Video item type matching API response
 */
export interface VideoItem {
	id: number;
	youtubeId: string;
	youtubeUrl: string;
	title: string | null;
	thumbnailUrl: string | null;
	duration: number | null;
	status: VideoStatus;
	createdAt: string;
	updatedAt: string;
}

interface VideoGridProps {
	/** Array of videos to display */
	videos: VideoItem[];
	/** Handler when a video is clicked */
	onVideoClick?: (video: VideoItem) => void;
	/** Loading state */
	isLoading?: boolean;
}

/**
 * Empty state component for when no videos exist
 */
function EmptyState() {
	return (
		<MotionWrapper>
			<m.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
				className="flex flex-col items-center justify-center py-16 px-4"
			>
				{/* Empty state illustration */}
				<m.div
					initial={{ scale: 0.8, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					transition={{ delay: 0.1, duration: 0.4 }}
					className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary-50"
				>
					<svg
						className="h-12 w-12 text-primary-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={1.5}
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
						/>
					</svg>
				</m.div>

				{/* Text content */}
				<m.h3
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.2 }}
					className="mb-2 text-xl font-semibold text-neutral-900"
				>
					No videos yet
				</m.h3>
				<m.p
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.3 }}
					className="mb-6 max-w-sm text-center text-neutral-500"
				>
					Add your first YouTube video to start building your knowledge base.
					Transcripts will be generated automatically.
				</m.p>

				{/* Call to action hint */}
				<m.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.4 }}
					className="flex items-center gap-2 text-sm text-primary-600"
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
							d="M12 4v16m8-8H4"
						/>
					</svg>
					<span>Click the "Add Video" button to get started</span>
				</m.div>
			</m.div>
		</MotionWrapper>
	);
}

/**
 * Loading skeleton for video cards
 */
function LoadingSkeleton() {
	return (
		<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{[...Array(8)].map((_, i) => (
				<div
					key={i}
					className="overflow-hidden rounded-xl border border-neutral-200 bg-white"
				>
					{/* Thumbnail skeleton */}
					<div className="aspect-video animate-pulse bg-neutral-200" />
					{/* Content skeleton */}
					<div className="p-4 space-y-3">
						<div className="h-5 w-16 animate-pulse rounded-full bg-neutral-200" />
						<div className="h-4 w-full animate-pulse rounded bg-neutral-200" />
						<div className="h-4 w-2/3 animate-pulse rounded bg-neutral-200" />
					</div>
				</div>
			))}
		</div>
	);
}

/**
 * VideoGrid component displaying a responsive grid of video cards
 * with staggered entrance animations and empty state
 */
export function VideoGrid({
	videos,
	onVideoClick,
	isLoading = false,
}: VideoGridProps) {
	// Show loading skeleton
	if (isLoading) {
		return <LoadingSkeleton />;
	}

	// Show empty state when no videos
	if (videos.length === 0) {
		return <EmptyState />;
	}

	// Stagger delay increment (100ms between each card)
	const staggerDelay = 0.1;

	return (
		<MotionWrapper>
			<m.div
				initial="hidden"
				animate="visible"
				className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
			>
				{videos.map((video, index) => (
					<VideoCard
						key={video.id}
						id={video.id}
						title={video.title}
						youtubeId={video.youtubeId}
						thumbnailUrl={video.thumbnailUrl}
						duration={video.duration}
						status={video.status}
						delay={index * staggerDelay}
						onClick={() => onVideoClick?.(video)}
					/>
				))}
			</m.div>
		</MotionWrapper>
	);
}
