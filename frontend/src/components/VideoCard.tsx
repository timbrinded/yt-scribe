import { m } from "framer-motion";
import { MotionWrapper } from "./MotionWrapper";

/**
 * Video status types matching backend schema
 */
export type VideoStatus = "pending" | "processing" | "completed" | "failed";

export interface VideoCardProps {
	/** Unique video ID */
	id: number;
	/** Video title (may be null for pending videos) */
	title: string | null;
	/** YouTube video ID for thumbnail */
	youtubeId: string;
	/** Thumbnail URL (may be null for pending videos) */
	thumbnailUrl: string | null;
	/** Duration in seconds (may be null for pending videos) */
	duration: number | null;
	/** Current processing status */
	status: VideoStatus;
	/** Animation delay for staggered entrance */
	delay?: number;
	/** Click handler */
	onClick?: () => void;
}

/**
 * Status badge configuration
 */
const statusConfig: Record<VideoStatus, { label: string; className: string }> =
	{
		pending: {
			label: "Pending",
			className: "bg-neutral-100 text-neutral-600 border-neutral-200",
		},
		processing: {
			label: "Processing",
			className: "bg-primary-50 text-primary-700 border-primary-200",
		},
		completed: {
			label: "Ready",
			className: "bg-success-500/10 text-success-500 border-success-500/20",
		},
		failed: {
			label: "Failed",
			className: "bg-error-500/10 text-error-500 border-error-500/20",
		},
	};

/**
 * Format duration from seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	}
	return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Generate YouTube thumbnail URL from video ID
 */
function getThumbnailUrl(
	youtubeId: string,
	quality: "default" | "mq" | "hq" | "maxres" = "hq",
): string {
	const qualityMap = {
		default: "default",
		mq: "mqdefault",
		hq: "hqdefault",
		maxres: "maxresdefault",
	};
	return `https://img.youtube.com/vi/${youtubeId}/${qualityMap[quality]}.jpg`;
}

/**
 * VideoCard component displaying video thumbnail, title, status, and duration
 * with hover animations and click interaction
 */
export function VideoCard({
	id,
	title,
	youtubeId,
	thumbnailUrl,
	duration,
	status,
	delay = 0,
	onClick,
}: VideoCardProps) {
	const statusInfo = statusConfig[status];
	const displayTitle = title || "Untitled Video";
	const thumbnail = thumbnailUrl || getThumbnailUrl(youtubeId);
	const isClickable = status === "completed";

	return (
		<MotionWrapper>
			<m.article
				data-testid="video-card"
				data-video-id={id}
				data-status={status}
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{
					duration: 0.4,
					delay,
					ease: [0.22, 1, 0.36, 1],
				}}
				whileHover={isClickable ? { y: -4, scale: 1.02 } : undefined}
				onClick={isClickable ? onClick : undefined}
				className={`group relative overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-shadow duration-300 ${
					isClickable
						? "cursor-pointer hover:border-primary-300 hover:shadow-lg"
						: "cursor-default"
				}`}
			>
				{/* Thumbnail container */}
				<div className="relative aspect-video overflow-hidden bg-neutral-100">
					<m.img
						src={thumbnail}
						alt={displayTitle}
						className="h-full w-full object-cover"
						loading="lazy"
						whileHover={isClickable ? { scale: 1.05 } : undefined}
						transition={{ duration: 0.3 }}
					/>

					{/* Duration overlay */}
					{duration !== null && (
						<div className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
							{formatDuration(duration)}
						</div>
					)}

					{/* Processing overlay */}
					{status === "processing" && (
						<m.div
							className="absolute inset-0 flex items-center justify-center bg-black/50"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
						>
							<m.div
								className="h-8 w-8 rounded-full border-2 border-white/30 border-t-white"
								animate={{ rotate: 360 }}
								transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
							/>
						</m.div>
					)}

					{/* Failed overlay */}
					{status === "failed" && (
						<div className="absolute inset-0 flex items-center justify-center bg-black/50">
							<div className="rounded-full bg-error-500/20 p-2">
								<svg
									className="h-6 w-6 text-error-500"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={2}
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
									/>
								</svg>
							</div>
						</div>
					)}
				</div>

				{/* Card content */}
				<div className="p-4">
					{/* Status badge */}
					<div className="mb-2">
						<m.span
							className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusInfo.className}`}
							animate={
								status === "processing"
									? {
											borderColor: [
												"rgba(var(--color-primary-300))",
												"rgba(var(--color-primary-500))",
												"rgba(var(--color-primary-300))",
											],
										}
									: undefined
							}
							transition={
								status === "processing"
									? { duration: 2, repeat: Infinity, ease: "easeInOut" }
									: undefined
							}
						>
							{status === "processing" && (
								<span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500" />
							)}
							{statusInfo.label}
						</m.span>
					</div>

					{/* Title */}
					<h3 className="line-clamp-2 text-sm font-medium text-neutral-900 group-hover:text-primary-700 transition-colors duration-200">
						{displayTitle}
					</h3>
				</div>

				{/* Hover gradient overlay for completed videos */}
				{isClickable && (
					<m.div
						className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary-500/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
						aria-hidden="true"
					/>
				)}
			</m.article>
		</MotionWrapper>
	);
}
