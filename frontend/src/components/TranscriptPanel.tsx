import { useState, useRef, useEffect, useCallback } from "react";
import { MotionWrapper } from "./MotionWrapper";
import { m, AnimatePresence } from "framer-motion";

/**
 * A transcript segment with timing information
 */
export interface TranscriptSegment {
	start: number;
	end: number;
	text: string;
}

interface TranscriptPanelProps {
	/** Array of transcript segments with timestamps */
	segments: TranscriptSegment[];
	/** Optional class name for styling */
	className?: string;
	/** Callback when a timestamp is clicked */
	onTimestampClick?: (time: number) => void;
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
function formatTimestamp(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	}
	return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Individual segment component
 */
function Segment({
	segment,
	isActive,
	onClick,
	segmentRef,
}: {
	segment: TranscriptSegment;
	isActive: boolean;
	onClick: () => void;
	segmentRef?: React.RefObject<HTMLDivElement | null>;
}) {
	return (
		<div
			ref={segmentRef}
			data-testid="transcript-segment"
			data-start={segment.start}
			className={`group flex gap-3 rounded-lg px-3 py-2 transition-all ${
				isActive
					? "bg-primary-100 ring-2 ring-primary-500/50"
					: "hover:bg-neutral-100"
			}`}
		>
			<button
				type="button"
				onClick={onClick}
				className={`shrink-0 font-mono text-xs tabular-nums transition-colors ${
					isActive
						? "text-primary-700 font-medium"
						: "text-neutral-400 group-hover:text-primary-600"
				}`}
				aria-label={`Jump to ${formatTimestamp(segment.start)}`}
			>
				{formatTimestamp(segment.start)}
			</button>
			<p
				className={`text-sm leading-relaxed ${
					isActive ? "text-neutral-900 font-medium" : "text-neutral-700"
				}`}
			>
				{segment.text}
			</p>
		</div>
	);
}

/**
 * Loading skeleton for transcript
 */
export function TranscriptSkeleton() {
	return (
		<div className="flex flex-col gap-3 p-4">
			{Array.from({ length: 8 }).map((_, i) => (
				<div key={i} className="flex gap-3 animate-pulse">
					<div className="h-4 w-12 rounded bg-neutral-200" />
					<div className="flex-1 space-y-2">
						<div className="h-4 w-full rounded bg-neutral-200" />
						<div className="h-4 w-3/4 rounded bg-neutral-200" />
					</div>
				</div>
			))}
		</div>
	);
}

/**
 * TranscriptPanel - displays scrollable transcript with clickable timestamps
 */
export function TranscriptPanel({
	segments,
	className = "",
	onTimestampClick,
}: TranscriptPanelProps) {
	const [activeIndex, setActiveIndex] = useState<number | null>(null);
	const [keyboardNavEnabled, setKeyboardNavEnabled] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());

	// Handle timestamp click
	const handleTimestampClick = useCallback(
		(index: number) => {
			const segment = segments[index];
			setActiveIndex(index);
			onTimestampClick?.(segment.start);
		},
		[segments, onTimestampClick],
	);

	// Scroll to segment
	const scrollToSegment = useCallback((index: number) => {
		const element = segmentRefs.current.get(index);
		if (element) {
			element.scrollIntoView({
				behavior: "smooth",
				block: "center",
			});
		}
	}, []);

	// Keyboard navigation
	useEffect(() => {
		if (!keyboardNavEnabled) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "ArrowDown" || e.key === "j") {
				e.preventDefault();
				const nextIndex = Math.min(
					(activeIndex ?? -1) + 1,
					segments.length - 1,
				);
				setActiveIndex(nextIndex);
				scrollToSegment(nextIndex);
				onTimestampClick?.(segments[nextIndex].start);
			} else if (e.key === "ArrowUp" || e.key === "k") {
				e.preventDefault();
				const prevIndex = Math.max((activeIndex ?? 1) - 1, 0);
				setActiveIndex(prevIndex);
				scrollToSegment(prevIndex);
				onTimestampClick?.(segments[prevIndex].start);
			} else if (e.key === "Escape") {
				setActiveIndex(null);
				setKeyboardNavEnabled(false);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		keyboardNavEnabled,
		activeIndex,
		segments,
		scrollToSegment,
		onTimestampClick,
	]);

	// Enable keyboard navigation on focus
	const handleContainerFocus = useCallback(() => {
		setKeyboardNavEnabled(true);
	}, []);

	const handleContainerBlur = useCallback((e: React.FocusEvent) => {
		// Only disable if focus is leaving the container entirely
		if (!e.currentTarget.contains(e.relatedTarget)) {
			setKeyboardNavEnabled(false);
		}
	}, []);

	if (segments.length === 0) {
		return (
			<div className={`flex items-center justify-center p-8 ${className}`}>
				<p className="text-sm text-neutral-500">No transcript available</p>
			</div>
		);
	}

	return (
		<MotionWrapper>
			<div
				ref={containerRef}
				className={`flex flex-col ${className}`}
				tabIndex={0}
				onFocus={handleContainerFocus}
				onBlur={handleContainerBlur}
				role="list"
				aria-label="Video transcript"
			>
				{/* Header with keyboard hint */}
				<AnimatePresence>
					{keyboardNavEnabled && (
						<m.div
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							className="border-b border-neutral-200 bg-primary-50 px-4 py-2"
						>
							<p className="text-xs text-primary-700">
								Use{" "}
								<kbd className="rounded bg-primary-100 px-1.5 py-0.5 font-mono">
									↑
								</kbd>{" "}
								<kbd className="rounded bg-primary-100 px-1.5 py-0.5 font-mono">
									↓
								</kbd>{" "}
								to navigate,{" "}
								<kbd className="rounded bg-primary-100 px-1.5 py-0.5 font-mono">
									Esc
								</kbd>{" "}
								to exit
							</p>
						</m.div>
					)}
				</AnimatePresence>

				{/* Segments list */}
				<div className="flex-1 overflow-y-auto p-4">
					<div className="flex flex-col gap-1">
						{segments.map((segment, index) => (
							<Segment
								key={`${segment.start}-${index}`}
								segment={segment}
								isActive={activeIndex === index}
								onClick={() => handleTimestampClick(index)}
								segmentRef={
									{
										current: segmentRefs.current.get(index) ?? null,
									} as React.RefObject<HTMLDivElement | null>
								}
							/>
						))}
					</div>
				</div>
			</div>
		</MotionWrapper>
	);
}
